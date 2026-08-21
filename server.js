require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mysql = require('mysql2/promise');

const app = express();
const port = Number(process.env.PORT || 3000);
const uploadDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const requiredEnvironment = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
if (missingEnvironment.length) {
  console.error(`Missing required environment values: ${missingEnvironment.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must contain at least 32 characters.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
});

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const allowedDocumentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedDocumentTypes.has(file.mimetype)) return callback(new Error('Only PDF, JPG, and PNG documents are allowed.'));
    callback(null, true);
  },
});
const resumeUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowedResumeTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!allowedResumeTypes.has(file.mimetype)) return callback(new Error('Only PDF, DOC, and DOCX resume files are allowed.'));
    callback(null, true);
  },
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((request, response, next) => {
  const origin = request.get('origin');
  const localOrigin = origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  if (localOrigin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait before trying again.' },
});

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();
const clean = (value) => String(value ?? '').trim();
const optional = (value) => clean(value) || null;
const missingFields = (source, fields) => fields.filter((field) => !clean(source[field]));
const parseArray = (value, limit = 25) => {
  if (Array.isArray(value)) return value.slice(0, limit);
  if (!clean(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch (_error) {
    return [];
  }
};
const cleanList = (value, limit = 25) => [...new Set(parseArray(value, limit).map(clean).filter(Boolean))];
const cleanRecords = (value, keys, limit = 20) => parseArray(value, limit).map((record) => {
  const cleaned = {};
  keys.forEach((key) => { cleaned[key] = clean(record?.[key]); });
  return cleaned;
}).filter((record) => Object.values(record).some(Boolean));
const profileCompletion = (profile) => {
  const items = [
    { id: 'basics', label: 'Basic information', weight: 10, complete: Boolean(profile.firstName && profile.lastName && profile.phone) },
    { id: 'headline', label: 'Professional headline', weight: 10, complete: Boolean(profile.headline) },
    { id: 'about', label: 'About you', weight: 10, complete: clean(profile.professionalSummary).length >= 50 },
    { id: 'location', label: 'Location', weight: 10, complete: Boolean(profile.city && profile.country) },
    { id: 'experience', label: 'Work experience', weight: 15, complete: Boolean(profile.experience?.some((item) => item.title && item.company)) },
    { id: 'education', label: 'Education', weight: 15, complete: Boolean(profile.education?.some((item) => item.degree && item.institution)) },
    { id: 'skills', label: 'Skills', weight: 10, complete: (profile.skills?.length || 0) >= 5 },
    { id: 'resume', label: 'Resume', weight: 10, complete: Boolean(profile.resume?.storedFileName) },
    { id: 'preferences', label: 'Job preferences', weight: 5, complete: Boolean(profile.preferredRoles?.length && profile.preferredLocations?.length && profile.workModes?.length) },
    { id: 'more', label: 'Projects and more', weight: 5, complete: Boolean(profile.projects?.length || profile.certifications?.length || profile.languages?.length) },
  ];
  return { percentage: items.reduce((total, item) => total + (item.complete ? item.weight : 0), 0), items };
};
const removeUploadedFile = (file) => {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
};

const issueAccessToken = (user, extra = {}) => jwt.sign(
  { accountType: user.account_type, ...extra },
  process.env.JWT_SECRET,
  { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'careerly' },
);

const authenticate = (request, response, next) => {
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return response.status(401).json({ error: 'Authentication is required.' });
  try {
    request.auth = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'careerly' });
    next();
  } catch (_error) {
    response.status(401).json({ error: 'Your session is invalid or has expired.' });
  }
};

const requireAccountType = (type) => (request, response, next) => {
  if (request.auth.accountType !== type) return response.status(403).json({ error: 'This account cannot access the requested resource.' });
  next();
};

const loadCandidateProfile = async (userId, connection = pool) => {
  const [profiles] = await connection.execute(
    `SELECT jsp.*, u.email
     FROM job_seeker_profiles jsp JOIN users u ON u.id = jsp.user_id
     WHERE jsp.user_id = ? LIMIT 1`,
    [userId],
  );
  const row = profiles[0];
  if (!row) return null;

  const [experienceRows] = await connection.execute(
    `SELECT job_title AS title, company_name AS company, location, start_date AS startDate,
            end_date AS endDate, description
     FROM candidate_work_experiences WHERE job_seeker_profile_id = ? ORDER BY sort_order, id`,
    [row.id],
  );
  const [educationRows] = await connection.execute(
    `SELECT degree, field_of_study AS field, institution, start_year AS startYear,
            end_year AS endYear, grade
     FROM candidate_educations WHERE job_seeker_profile_id = ? ORDER BY sort_order, id`,
    [row.id],
  );
  const [skillRows] = await connection.execute(
    'SELECT skill_name FROM candidate_skills WHERE job_seeker_profile_id = ? ORDER BY id',
    [row.id],
  );
  const [projectRows] = await connection.execute(
    `SELECT project_name AS name, role_name AS role, project_url AS url, description
     FROM candidate_projects WHERE job_seeker_profile_id = ? ORDER BY sort_order, id`,
    [row.id],
  );
  const [certificationRows] = await connection.execute(
    `SELECT certification_name AS name, issuer, issue_year AS year, credential_url AS credentialUrl
     FROM candidate_certifications WHERE job_seeker_profile_id = ? ORDER BY sort_order, id`,
    [row.id],
  );
  const [languageRows] = await connection.execute(
    'SELECT language_name FROM candidate_languages WHERE job_seeker_profile_id = ? ORDER BY id',
    [row.id],
  );
  const [preferenceRows] = await connection.execute(
    `SELECT preferred_roles, preferred_locations, work_modes
     FROM candidate_job_preferences WHERE job_seeker_profile_id = ? LIMIT 1`,
    [row.id],
  );
  const preferences = preferenceRows[0] || {};

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    phone: row.phone || '',
    headline: row.headline || '',
    professionalSummary: row.professional_summary || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country || '',
    experienceYears: row.experience_years == null ? '' : String(row.experience_years),
    currentCompany: row.current_company || '',
    currentJobTitle: row.current_job_title || '',
    portfolioUrl: row.portfolio_url || '',
    linkedinUrl: row.linkedin_url || '',
    employmentStatus: row.employment_status || '',
    salaryExpectation: row.salary_expectation || '',
    noticePeriod: row.notice_period || '',
    profileVisibility: row.profile_visibility || 'employers_only',
    experience: experienceRows,
    education: educationRows,
    skills: skillRows.map((item) => item.skill_name),
    projects: projectRows,
    certifications: certificationRows,
    languages: languageRows.map((item) => item.language_name),
    preferredRoles: parseArray(preferences.preferred_roles, 10).map(clean).filter(Boolean),
    preferredLocations: parseArray(preferences.preferred_locations, 10).map(clean).filter(Boolean),
    workModes: parseArray(preferences.work_modes, 5).map(clean).filter(Boolean),
    resume: row.resume_path ? {
      originalFileName: row.resume_original_name || 'resume',
      storedFileName: path.basename(row.resume_path),
      mimeType: row.resume_mime_type || 'application/octet-stream',
      size: Number(row.resume_size_bytes || 0),
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/job-seekers/register', authLimiter, async (request, response, next) => {
  const required = missingFields(request.body, ['firstName', 'lastName', 'email', 'password']);
  if (required.length) return response.status(400).json({ error: `Missing required fields: ${required.join(', ')}` });
  if (clean(request.body.password).length < 8) return response.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (request.body.password !== request.body.confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const email = normalizeEmail(request.body.email);
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const [userResult] = await connection.execute(
      `INSERT INTO users (email, password_hash, account_type, account_status)
       VALUES (?, ?, 'job_seeker', 'active')`,
      [email, passwordHash],
    );
    await connection.execute(
      `INSERT INTO job_seeker_profiles (user_id, first_name, last_name)
       VALUES (?, ?, ?)`,
      [userResult.insertId, clean(request.body.firstName), clean(request.body.lastName)],
    );
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES (?, 'job_seeker.registered', 'user', ?, ?)`,
      [userResult.insertId, userResult.insertId, request.ip],
    );
    await connection.commit();
    const user = { id: userResult.insertId, account_type: 'job_seeker' };
    response.status(201).json({
      message: 'Job seeker account created.',
      accessToken: issueAccessToken(user),
      user: { id: user.id, email, accountType: 'job_seeker', firstName: clean(request.body.firstName), lastName: clean(request.body.lastName) },
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'An account already exists for this email.' });
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/employers/register', authLimiter, upload.single('document'), async (request, response, next) => {
  const requiredNames = [
    'firstName', 'lastName', 'workEmail', 'phone', 'designation', 'password',
    'legalName', 'website', 'companyType', 'industry', 'companySize', 'address',
    'city', 'state', 'postalCode', 'companyAbout', 'documentType',
  ];
  const required = missingFields(request.body, requiredNames);
  if (required.length || !request.file || !request.body.authorization || !request.body.terms) {
    removeUploadedFile(request.file);
    return response.status(400).json({ error: 'Complete all required company, document, and authorization fields.' });
  }
  if (clean(request.body.password).length < 8) {
    removeUploadedFile(request.file);
    return response.status(400).json({ error: 'Password must contain at least 8 characters.' });
  }
  if (request.body.password !== request.body.confirmPassword) {
    removeUploadedFile(request.file);
    return response.status(400).json({ error: 'Passwords do not match.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const email = normalizeEmail(request.body.workEmail);
    const passwordHash = await bcrypt.hash(request.body.password, 12);
    const foundedYear = optional(request.body.founded) ? Number(request.body.founded) : null;

    const [companyResult] = await connection.execute(
      `INSERT INTO companies
       (legal_name, brand_name, website, company_type, industry, company_size, founded_year,
        description, registered_address, city, state, country, postal_code, cin, gstin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean(request.body.legalName), optional(request.body.brandName), clean(request.body.website),
        clean(request.body.companyType), clean(request.body.industry), clean(request.body.companySize), foundedYear,
        clean(request.body.companyAbout), clean(request.body.address), clean(request.body.city), clean(request.body.state),
        optional(request.body.country) || 'India', clean(request.body.postalCode), optional(request.body.cin), optional(request.body.gstin),
      ],
    );

    const [userResult] = await connection.execute(
      `INSERT INTO users (email, password_hash, account_type, account_status)
       VALUES (?, ?, 'employer', 'active')`,
      [email, passwordHash],
    );

    await connection.execute(
      `INSERT INTO employer_profiles
       (user_id, company_id, first_name, last_name, phone_country_code, phone, designation,
        is_primary_authorized_representative, authorization_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW())`,
      [
        userResult.insertId, companyResult.insertId, clean(request.body.firstName), clean(request.body.lastName),
        optional(request.body.phoneCountryCode) || '+91', clean(request.body.phone), clean(request.body.designation),
      ],
    );

    await connection.execute(
      `INSERT INTO company_documents
       (company_id, uploaded_by_user_id, document_type, original_file_name, stored_file_name,
        stored_path, mime_type, file_size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyResult.insertId, userResult.insertId, clean(request.body.documentType), request.file.originalname,
        request.file.filename, request.file.path, request.file.mimetype, request.file.size,
      ],
    );

    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, metadata)
       VALUES (?, 'employer.registered', 'company', ?, ?, JSON_OBJECT('document_type', ?))`,
      [userResult.insertId, companyResult.insertId, request.ip, clean(request.body.documentType)],
    );

    await connection.commit();
    const applicationReference = `CAR-EMP-${String(companyResult.insertId).padStart(6, '0')}`;
    response.status(201).json({
      message: 'Company registration submitted for verification.',
      applicationReference,
      company: { id: companyResult.insertId, legalName: clean(request.body.legalName), verificationStatus: 'pending' },
    });
  } catch (error) {
    await connection.rollback();
    removeUploadedFile(request.file);
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'The email, CIN, or GSTIN is already registered.' });
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  const email = normalizeEmail(request.body.email);
  const password = clean(request.body.password);
  const requestedType = optional(request.body.accountType);
  if (!email || !password) return response.status(400).json({ error: 'Email and password are required.' });

  try {
    const [rows] = await pool.execute(
      `SELECT id, email, password_hash, account_type, account_status
       FROM users WHERE email = ? LIMIT 1`,
      [email],
    );
    const user = rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches) return response.status(401).json({ error: 'Incorrect email or password.' });
    if (requestedType && user.account_type !== requestedType) return response.status(403).json({ error: `This email is registered as a ${user.account_type.replace('_', ' ')} account.` });
    if (user.account_status !== 'active') return response.status(403).json({ error: `This account is currently ${user.account_status}.` });

    let company = null;
    let companyId = null;
    if (user.account_type === 'employer') {
      const [companies] = await pool.execute(
        `SELECT c.id, c.legal_name, c.brand_name, c.verification_status
         FROM employer_profiles ep JOIN companies c ON c.id = ep.company_id
         WHERE ep.user_id = ? LIMIT 1`,
        [user.id],
      );
      company = companies[0] || null;
      companyId = company?.id || null;
    }

    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES (?, 'auth.login', 'user', ?, ?)`,
      [user.id, user.id, request.ip],
    );

    response.json({
      message: 'Signed in successfully.',
      accessToken: issueAccessToken(user, companyId ? { companyId } : {}),
      user: { id: user.id, email: user.email, accountType: user.account_type },
      company: company ? { id: company.id, legalName: company.legal_name, brandName: company.brand_name, verificationStatus: company.verification_status } : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', authenticate, async (request, response, next) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, email, account_type, account_status, email_verified_at, last_login_at, created_at FROM users WHERE id = ? LIMIT 1',
      [request.auth.sub],
    );
    if (!users[0]) return response.status(404).json({ error: 'Account not found.' });
    response.json({ user: users[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/job-seekers/me', authenticate, requireAccountType('job_seeker'), async (request, response, next) => {
  try {
    const profile = await loadCandidateProfile(request.auth.sub);
    if (!profile) return response.status(404).json({ error: 'Job seeker profile not found.' });
    response.json({ profile, completion: profileCompletion(profile) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/job-seekers/me', authenticate, requireAccountType('job_seeker'), resumeUpload.single('resume'), async (request, response, next) => {
  const connection = await pool.getConnection();
  let previousResumePath = null;
  try {
    await connection.beginTransaction();
    const [profileRows] = await connection.execute(
      'SELECT id, resume_path FROM job_seeker_profiles WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [request.auth.sub],
    );
    if (!profileRows[0]) {
      removeUploadedFile(request.file);
      await connection.rollback();
      return response.status(404).json({ error: 'Job seeker profile not found.' });
    }
    const profileId = profileRows[0].id;
    previousResumePath = profileRows[0].resume_path;
    const resumeValues = request.file
      ? [request.file.path, request.file.originalname, request.file.mimetype, request.file.size]
      : [previousResumePath, null, null, null];

    await connection.execute(
      `UPDATE job_seeker_profiles SET
       first_name = ?, last_name = ?, phone = ?, headline = ?, professional_summary = ?,
       city = ?, state = ?, country = ?, experience_years = ?, current_company = ?,
       current_job_title = ?, portfolio_url = ?, linkedin_url = ?, employment_status = ?,
       salary_expectation = ?, notice_period = ?, profile_visibility = ?,
       resume_path = ?,
       resume_original_name = COALESCE(?, resume_original_name),
       resume_mime_type = COALESCE(?, resume_mime_type),
       resume_size_bytes = COALESCE(?, resume_size_bytes)
       WHERE id = ?`,
      [
        clean(request.body.firstName), clean(request.body.lastName), optional(request.body.phone), optional(request.body.headline),
        optional(request.body.professionalSummary), optional(request.body.city), optional(request.body.state),
        optional(request.body.country) || 'India', optional(request.body.experienceYears) ? Number(request.body.experienceYears) : null,
        optional(request.body.currentCompany), optional(request.body.currentJobTitle), optional(request.body.portfolioUrl),
        optional(request.body.linkedinUrl), optional(request.body.employmentStatus), optional(request.body.salaryExpectation),
        optional(request.body.noticePeriod), optional(request.body.profileVisibility) || 'employers_only',
        ...resumeValues, profileId,
      ],
    );

    const experience = cleanRecords(request.body.experience, ['title', 'company', 'location', 'startDate', 'endDate', 'description'], 20);
    const education = cleanRecords(request.body.education, ['degree', 'field', 'institution', 'startYear', 'endYear', 'grade'], 15);
    const projects = cleanRecords(request.body.projects, ['name', 'role', 'url', 'description'], 15);
    const certifications = cleanRecords(request.body.certifications, ['name', 'issuer', 'year', 'credentialUrl'], 15);
    const skills = cleanList(request.body.skills, 40);
    const languages = cleanList(request.body.languages, 12);
    const preferredRoles = cleanList(request.body.preferredRoles, 10);
    const preferredLocations = cleanList(request.body.preferredLocations, 10);
    const workModes = cleanList(request.body.workModes, 5);

    await connection.execute('DELETE FROM candidate_work_experiences WHERE job_seeker_profile_id = ?', [profileId]);
    await connection.execute('DELETE FROM candidate_educations WHERE job_seeker_profile_id = ?', [profileId]);
    await connection.execute('DELETE FROM candidate_skills WHERE job_seeker_profile_id = ?', [profileId]);
    await connection.execute('DELETE FROM candidate_projects WHERE job_seeker_profile_id = ?', [profileId]);
    await connection.execute('DELETE FROM candidate_certifications WHERE job_seeker_profile_id = ?', [profileId]);
    await connection.execute('DELETE FROM candidate_languages WHERE job_seeker_profile_id = ?', [profileId]);

    for (const [index, item] of experience.entries()) {
      await connection.execute(
        `INSERT INTO candidate_work_experiences
         (job_seeker_profile_id, job_title, company_name, location, start_date, end_date, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [profileId, item.title, item.company, optional(item.location), optional(item.startDate), optional(item.endDate), optional(item.description), index],
      );
    }
    for (const [index, item] of education.entries()) {
      await connection.execute(
        `INSERT INTO candidate_educations
         (job_seeker_profile_id, degree, field_of_study, institution, start_year, end_year, grade, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [profileId, item.degree, optional(item.field), item.institution, optional(item.startYear), optional(item.endYear), optional(item.grade), index],
      );
    }
    for (const skill of skills) await connection.execute('INSERT INTO candidate_skills (job_seeker_profile_id, skill_name) VALUES (?, ?)', [profileId, skill]);
    for (const [index, item] of projects.entries()) {
      await connection.execute(
        `INSERT INTO candidate_projects (job_seeker_profile_id, project_name, role_name, project_url, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [profileId, item.name, optional(item.role), optional(item.url), optional(item.description), index],
      );
    }
    for (const [index, item] of certifications.entries()) {
      await connection.execute(
        `INSERT INTO candidate_certifications
         (job_seeker_profile_id, certification_name, issuer, issue_year, credential_url, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [profileId, item.name, optional(item.issuer), optional(item.year), optional(item.credentialUrl), index],
      );
    }
    for (const language of languages) await connection.execute('INSERT INTO candidate_languages (job_seeker_profile_id, language_name) VALUES (?, ?)', [profileId, language]);
    await connection.execute(
      `INSERT INTO candidate_job_preferences (job_seeker_profile_id, preferred_roles, preferred_locations, work_modes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE preferred_roles = VALUES(preferred_roles), preferred_locations = VALUES(preferred_locations), work_modes = VALUES(work_modes)`,
      [profileId, JSON.stringify(preferredRoles), JSON.stringify(preferredLocations), JSON.stringify(workModes)],
    );
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES (?, 'job_seeker.profile_updated', 'job_seeker_profile', ?, ?)`,
      [request.auth.sub, profileId, request.ip],
    );
    await connection.commit();
    if (request.file && previousResumePath && fs.existsSync(previousResumePath)) fs.promises.unlink(previousResumePath).catch(() => {});
    const profile = await loadCandidateProfile(request.auth.sub);
    response.json({ message: 'Profile saved successfully.', profile, completion: profileCompletion(profile) });
  } catch (error) {
    await connection.rollback();
    removeUploadedFile(request.file);
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/job-seekers/me/resume', authenticate, requireAccountType('job_seeker'), async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT resume_path, resume_original_name FROM job_seeker_profiles WHERE user_id = ? LIMIT 1',
      [request.auth.sub],
    );
    const resumePath = rows[0]?.resume_path;
    if (!resumePath || !fs.existsSync(resumePath)) return response.status(404).json({ error: 'No resume has been uploaded.' });
    response.download(resumePath, rows[0].resume_original_name || 'resume');
  } catch (error) {
    next(error);
  }
});

app.get('/api/employers/me', authenticate, requireAccountType('employer'), async (request, response, next) => {
  try {
    const [profiles] = await pool.execute(
      `SELECT u.id AS user_id, u.email, ep.first_name, ep.last_name, ep.phone, ep.designation,
              c.id AS company_id, c.legal_name, c.brand_name, c.website, c.industry,
              c.company_size, c.verification_status
       FROM users u
       JOIN employer_profiles ep ON ep.user_id = u.id
       JOIN companies c ON c.id = ep.company_id
       WHERE u.id = ? LIMIT 1`,
      [request.auth.sub],
    );
    if (!profiles[0]) return response.status(404).json({ error: 'Employer profile not found.' });
    const [teams] = await pool.execute(
      `SELECT hpt.team_name FROM hiring_preferences hp
       JOIN hiring_preference_teams hpt ON hpt.hiring_preference_id = hp.id
       WHERE hp.company_id = ? ORDER BY hpt.team_name`,
      [profiles[0].company_id],
    );
    response.json({ profile: profiles[0], hiringTeams: teams.map((row) => row.team_name) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/companies', async (_request, response, next) => {
  try {
    const [companies] = await pool.execute(
      `SELECT c.id, c.legal_name AS legalName, c.brand_name AS brandName, c.website,
              c.company_type AS companyType, c.industry, c.company_size AS companySize,
              c.description, c.city, c.state, c.verification_status AS verificationStatus,
              c.created_at AS createdAt, COUNT(CASE WHEN j.status = 'published' THEN 1 END) AS jobCount
       FROM companies c LEFT JOIN jobs j ON j.company_id = c.id
       GROUP BY c.id ORDER BY c.created_at DESC, c.id DESC`,
    );
    response.json({ companies, total: companies.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/companies/:id', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, legal_name, brand_name, website, industry, company_size, founded_year,
              description, city, state, country, verification_status
       FROM companies WHERE id = ? AND verification_status = 'verified' LIMIT 1`,
      [request.params.id],
    );
    if (!rows[0]) return response.status(404).json({ error: 'Verified company not found.' });
    response.json({ company: rows[0] });
  } catch (error) {
    next(error);
  }
});

const privatePaths = new Set(['uploads', 'database', 'node_modules']);
const privateFiles = new Set(['server.js', 'package.json', 'package-lock.json', 'DATABASE_SETUP.md', '.env', '.env.example', '.gitignore']);
app.use((request, response, next) => {
  const firstPathSegment = request.path.split('/').filter(Boolean)[0] || '';
  if (privatePaths.has(firstPathSegment) || privateFiles.has(firstPathSegment) || firstPathSegment.startsWith('.env')) {
    return response.status(403).json({ error: 'This server resource is private.' });
  }
  next();
});
app.use(express.static(path.join(__dirname, 'frontend'), { extensions: ['html'], index: 'homepage.html' }));

app.use((request, response) => response.status(404).json({ error: `Route not found: ${request.method} ${request.path}` }));
app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) return response.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? (error.field === 'resume' ? 'Resume must be smaller than 5 MB.' : 'Document must be smaller than 10 MB.') : error.message });
  if (error.message?.includes('Only PDF')) return response.status(400).json({ error: error.message });
  console.error(error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

const start = async () => {
  await pool.query('SELECT 1');
  app.listen(port, () => console.log(`Careerly is running at http://localhost:${port}`));
};

start().catch((error) => {
  console.error('Unable to connect to MySQL. Check .env and database/schema.sql.', error.message);
  process.exit(1);
});
