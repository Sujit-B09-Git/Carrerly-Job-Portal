const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { databaseFile, readDatabase, saveDatabase } = require('./database/local-sqlite');

const app = express();
const port = Number(process.env.PORT || 3000);
const storageRoot = process.env.CAREERLY_STORAGE_ROOT ? path.resolve(process.env.CAREERLY_STORAGE_ROOT) : __dirname;
const dataDirectory = path.join(storageRoot, 'data');
const legacyDataFile = path.join(dataDirectory, 'local-database.json');
const uploadDirectory = path.join(storageRoot, 'uploads');
const jwtSecret = process.env.JWT_SECRET || crypto.createHash('sha256').update(`careerly-local-${__dirname}`).digest('hex');

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });

// One-time preservation of existing local JSON data during the SQLite upgrade.
if (fs.existsSync(legacyDataFile) && readDatabase().users.length === 0) {
  saveDatabase(JSON.parse(fs.readFileSync(legacyDataFile, 'utf8')));
}

const nextId = (database, entity) => {
  database.counters[entity] = Number(database.counters[entity] || 0) + 1;
  return database.counters[entity];
};

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();
const clean = (value) => String(value ?? '').trim();
const missing = (body, fields) => fields.filter((field) => !clean(body[field]));
const now = () => new Date().toISOString();
const removeFile = (file) => { if (file?.path) fs.promises.unlink(file.path).catch(() => {}); };
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

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (_request, file, callback) => {
    const allowed = file.fieldname === 'companyLogo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf', 'image/jpeg', 'image/png'];
    callback(allowed.includes(file.mimetype) ? null : new Error(file.fieldname === 'companyLogo' ? 'Only JPG, PNG, and WebP company logos are allowed.' : 'Only PDF, JPG, and PNG documents are allowed.'), allowed.includes(file.mimetype));
  },
});
const resumeUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    callback(allowed.includes(file.mimetype) ? null : new Error('Only PDF, DOC, and DOCX resume files are allowed.'), allowed.includes(file.mimetype));
  },
});
const profileUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_request, file, callback) => {
    const resumeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowed = file.fieldname === 'resume' ? resumeTypes : photoTypes;
    callback(allowed.includes(file.mimetype) ? null : new Error(file.fieldname === 'profilePhoto' ? 'Only JPG, PNG, and WebP profile photos are allowed.' : 'Only PDF, DOC, and DOCX resume files are allowed.'), allowed.includes(file.mimetype));
  },
}).fields([{ name: 'resume', maxCount: 1 }, { name: 'profilePhoto', maxCount: 1 }]);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
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
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait and try again.' },
});

const issueToken = (user, extra = {}) => jwt.sign(
  { accountType: user.accountType, ...extra },
  jwtSecret,
  { subject: String(user.id), expiresIn: '8h', issuer: 'careerly-local' },
);

const authenticate = (request, response, next) => {
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  try {
    if (!token) throw new Error('Missing token');
    request.auth = jwt.verify(token, jwtSecret, { issuer: 'careerly-local' });
    next();
  } catch (_error) {
    response.status(401).json({ error: 'Your session is invalid or has expired.' });
  }
};
const requireAccountType = (type) => (request, response, next) => {
  if (request.auth.accountType !== type) return response.status(403).json({ error: 'This account cannot access the requested resource.' });
  next();
};

app.get('/api/health', (_request, response) => response.json({ status: 'ok', database: 'sqlite', databaseFile: 'database/careerly.sqlite' }));

app.get('/api/jobs', (request, response) => {
  const term = clean(request.query.q).toLowerCase();
  const location = clean(request.query.location).toLowerCase();
  const workModel = clean(request.query.workModel).toLowerCase();
  const employmentType = clean(request.query.employmentType).toLowerCase();
  const companyId = Number(request.query.companyId);
  const jobs = readDatabase().jobs
    .filter((job) => job.status === 'published')
    .filter((job) => !companyId || job.companyId === companyId)
    .map((job) => ({ ...job, company: readDatabase().companies.find((company) => company.id === job.companyId) }))
    .filter((job) => job.company)
    .filter((job) => !term || [job.title, job.department, job.description, ...(job.skills || []), job.company.legalName, job.company.brandName].join(' ').toLowerCase().includes(term))
    .filter((job) => !location || [job.city, job.state, job.country, job.workModel].join(' ').toLowerCase().includes(location))
    .filter((job) => !workModel || job.workModel === workModel)
    .filter((job) => !employmentType || job.employmentType === employmentType);
  response.json({ jobs, total: jobs.length });
});

app.get('/api/companies', (_request, response) => {
  const database = readDatabase();
  const companies = database.companies
    .map((company) => ({
      id: company.id, legalName: company.legalName, brandName: company.brandName,
      website: company.website, companyType: company.companyType, industry: company.industry,
      companySize: company.companySize, description: company.description, city: company.city,
      state: company.state, logoUrl: company.logoPath ? `/api/companies/${company.id}/logo` : '', verificationStatus: company.verificationStatus, createdAt: company.createdAt,
      jobCount: database.jobs.filter((job) => job.companyId === company.id && job.status === 'published').length,
    }))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  response.json({ companies, total: companies.length });
});

app.get('/api/companies/:id', (request, response) => {
  const company = readDatabase().companies.find((item) => item.id === Number(request.params.id));
  if (!company) return response.status(404).json({ error: 'Company not found.' });
  const jobCount = readDatabase().jobs.filter((job) => job.companyId === company.id && job.status === 'published').length;
  response.json({ company: { ...company, jobCount } });
});

app.get('/api/companies/:id/logo', (request, response) => {
  const company = readDatabase().companies.find((item) => item.id === Number(request.params.id));
  const logoPath = company?.logoPath ? path.join(uploadDirectory, path.basename(company.logoPath)) : null;
  if (!logoPath || !fs.existsSync(logoPath)) return response.status(404).json({ error: 'Company logo not found.' });
  response.type(company.logoMimeType || 'image/png').sendFile(logoPath);
});

app.post('/api/jobs/:jobId/applications', authenticate, requireAccountType('job_seeker'), (request, response) => {
  const database = readDatabase();
  const job = database.jobs.find((item) => item.id === Number(request.params.jobId) && item.status === 'published');
  if (!job) return response.status(404).json({ error: 'This vacancy is no longer available.' });
  if (database.applications.some((item) => item.jobId === job.id && item.jobSeekerUserId === Number(request.auth.sub))) return response.status(409).json({ error: 'You have already applied for this job.' });
  const profile = database.jobSeekers.find((item) => String(item.userId) === String(request.auth.sub));
  const application = { id: nextId(database, 'application'), jobId: job.id, jobSeekerUserId: Number(request.auth.sub), coverLetter: clean(request.body.coverLetter), resumePath: profile?.resume?.storedFileName || '', status: 'submitted', appliedAt: now(), updatedAt: now() };
  database.applications.push(application);
  database.auditLogs.push({ userId: application.jobSeekerUserId, action: 'job.applied', createdAt: now() });
  saveDatabase(database);
  response.status(201).json({ message: 'Application submitted.', application });
});

app.get('/api/job-seekers/me/applications', authenticate, requireAccountType('job_seeker'), (request, response) => {
  const database = readDatabase();
  const applications = database.applications
    .filter((application) => application.jobSeekerUserId === Number(request.auth.sub))
    .map((application) => {
      const job = database.jobs.find((item) => item.id === application.jobId);
      const company = database.companies.find((item) => item.id === job?.companyId);
      return { ...application, job: job ? { ...job, company: company ? { id: company.id, legalName: company.legalName, brandName: company.brandName, industry: company.industry, logoUrl: company.logoPath ? `/api/companies/${company.id}/logo` : '' } : null } : null };
    })
    .sort((first, second) => new Date(second.appliedAt) - new Date(first.appliedAt));
  response.json({ applications, total: applications.length });
});

app.post('/api/employer/jobs', authenticate, requireAccountType('employer'), (request, response) => {
  const required = missing(request.body, ['title', 'description', 'employmentType', 'workModel']);
  if (required.length) return response.status(400).json({ error: `Missing required job fields: ${required.join(', ')}` });
  const database = readDatabase();
  const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
  if (!employer) return response.status(404).json({ error: 'Employer profile not found.' });
  const company = database.companies.find((item) => item.id === employer.companyId);
  const job = {
    id: nextId(database, 'job'), companyId: employer.companyId, createdByUserId: employer.userId,
    title: clean(request.body.title), department: clean(request.body.department), description: clean(request.body.description),
    employmentType: clean(request.body.employmentType), workModel: clean(request.body.workModel), city: clean(request.body.city), state: clean(request.body.state),
    country: clean(request.body.country) || 'India', minExperienceYears: clean(request.body.minExperienceYears), maxExperienceYears: clean(request.body.maxExperienceYears),
    salaryMin: clean(request.body.salaryMin), salaryMax: clean(request.body.salaryMax), currency: clean(request.body.currency) || 'INR',
    skills: [...new Set(clean(request.body.skills).split(',').map((skill) => skill.trim()).filter(Boolean))].slice(0, 25),
    status: 'published', publishedAt: now(), createdAt: now(), updatedAt: now(),
  };
  database.jobs.push(job);
  database.auditLogs.push({ userId: employer.userId, action: 'job.published', createdAt: now() });
  saveDatabase(database);
  response.status(201).json({ message: 'Job published.', job });
});

app.get('/api/employer/dashboard', authenticate, requireAccountType('employer'), (request, response) => {
  const database = readDatabase();
  const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
  if (!employer) return response.status(404).json({ error: 'Employer profile not found.' });
  const company = database.companies.find((item) => item.id === employer.companyId);
  const jobs = database.jobs.filter((job) => job.companyId === employer.companyId);
  const applications = database.applications.filter((application) => jobs.some((job) => job.id === application.jobId));
  const candidates = Object.fromEntries(database.jobSeekers.map((profile) => [profile.userId, profile]));
  response.json({
    employer: {
      firstName: employer.firstName, lastName: employer.lastName, designation: employer.designation,
      phoneCountryCode: employer.phoneCountryCode, phone: employer.phone,
      workEmail: database.users.find((user) => user.id === employer.userId)?.email || '',
    }, company,
    metrics: { activeJobs: jobs.filter((job) => job.status === 'published').length, applications: applications.length, shortlisted: applications.filter((application) => application.status === 'shortlisted').length },
    jobs, applications: applications.map((application) => {
      const candidate = candidates[application.jobSeekerUserId];
      const candidateUser = database.users.find((user) => user.id === application.jobSeekerUserId);
      return { ...application, job: jobs.find((job) => job.id === application.jobId), candidate: candidate ? {
        firstName: candidate.firstName, lastName: candidate.lastName, email: candidateUser?.email || '', phone: candidate.phone || '',
        headline: candidate.headline || '', professionalSummary: candidate.professionalSummary || '', city: candidate.city || '', state: candidate.state || '', country: candidate.country || 'India',
        experienceYears: candidate.experienceYears || '', currentCompany: candidate.currentCompany || '', currentJobTitle: candidate.currentJobTitle || '', employmentStatus: candidate.employmentStatus || '',
        skills: candidate.skills || [], languages: candidate.languages || [], experience: candidate.experience || [], education: candidate.education || [], projects: candidate.projects || [], certifications: candidate.certifications || [],
        portfolioUrl: candidate.portfolioUrl || '', linkedinUrl: candidate.linkedinUrl || '', resumeAvailable: Boolean(application.resumePath || candidate.resume?.storedFileName),
      } : null };
    }),
  });
});

app.put('/api/employer/profile', authenticate, requireAccountType('employer'), upload.single('companyLogo'), (request, response, next) => {
  const logoFile = request.file;
  try {
    const required = missing(request.body, ['firstName', 'lastName', 'workEmail', 'designation', 'legalName', 'website', 'companyType', 'industry', 'companySize', 'address', 'city', 'state', 'postalCode', 'companyAbout']);
    if (required.length) {
      removeFile(logoFile);
      return response.status(400).json({ error: `Missing required profile fields: ${required.join(', ')}` });
    }

    const database = readDatabase();
    const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
    const user = database.users.find((item) => String(item.id) === String(request.auth.sub));
    const company = database.companies.find((item) => item.id === employer?.companyId);
    if (!employer || !user || !company) {
      removeFile(logoFile);
      return response.status(404).json({ error: 'Employer company profile not found.' });
    }

    const workEmail = normalizeEmail(request.body.workEmail);
    const emailOwner = database.users.find((item) => item.email === workEmail && item.id !== user.id);
    if (emailOwner) {
      removeFile(logoFile);
      return response.status(409).json({ error: 'This work email is already used by another Careerly account.' });
    }

    employer.firstName = clean(request.body.firstName);
    employer.lastName = clean(request.body.lastName);
    employer.phoneCountryCode = clean(request.body.phoneCountryCode) || '+91';
    employer.phone = clean(request.body.phone);
    employer.designation = clean(request.body.designation);
    employer.updatedAt = now();
    user.email = workEmail;

    const previousLogo = company.logoPath;
    company.legalName = clean(request.body.legalName);
    company.brandName = clean(request.body.brandName);
    company.website = clean(request.body.website);
    company.companyType = clean(request.body.companyType);
    company.industry = clean(request.body.industry);
    company.companySize = clean(request.body.companySize);
    company.foundedYear = clean(request.body.founded) || null;
    company.description = clean(request.body.companyAbout);
    company.address = clean(request.body.address);
    company.city = clean(request.body.city);
    company.state = clean(request.body.state);
    company.postalCode = clean(request.body.postalCode);
    company.cin = clean(request.body.cin) || null;
    company.gstin = clean(request.body.gstin) || null;
    if (logoFile) {
      company.logoPath = logoFile.filename;
      company.logoMimeType = logoFile.mimetype;
    }
    company.updatedAt = now();
    database.auditLogs.push({ userId: employer.userId, action: 'employer.profile.updated', companyId: company.id, createdAt: now() });
    saveDatabase(database);

    if (logoFile && previousLogo && previousLogo !== logoFile.filename) {
      fs.promises.unlink(path.join(uploadDirectory, path.basename(previousLogo))).catch(() => {});
    }
    response.json({ message: 'Company profile updated successfully.', company, employer: { ...employer, workEmail: user.email } });
  } catch (error) {
    removeFile(logoFile);
    next(error);
  }
});

app.put('/api/employer/profile/logo', authenticate, requireAccountType('employer'), upload.single('companyLogo'), (request, response, next) => {
  const logoFile = request.file;
  try {
    if (!logoFile) return response.status(400).json({ error: 'Choose a JPG, PNG, or WebP company logo.' });
    const database = readDatabase();
    const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
    const company = database.companies.find((item) => item.id === employer?.companyId);
    if (!employer || !company) {
      removeFile(logoFile);
      return response.status(404).json({ error: 'Employer company profile not found.' });
    }

    const previousLogo = company.logoPath;
    company.logoPath = logoFile.filename;
    company.logoMimeType = logoFile.mimetype;
    company.updatedAt = now();
    database.auditLogs.push({ userId: employer.userId, action: 'employer.logo.updated', companyId: company.id, createdAt: now() });
    saveDatabase(database);
    if (previousLogo && previousLogo !== logoFile.filename) {
      fs.promises.unlink(path.join(uploadDirectory, path.basename(previousLogo))).catch(() => {});
    }
    response.json({ message: 'Company logo updated successfully.', logoUrl: `/api/companies/${company.id}/logo`, company });
  } catch (error) {
    removeFile(logoFile);
    next(error);
  }
});

app.get('/api/employer/applications/:applicationId/resume', authenticate, requireAccountType('employer'), (request, response) => {
  const database = readDatabase();
  const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
  const application = database.applications.find((item) => item.id === Number(request.params.applicationId));
  const job = database.jobs.find((item) => item.id === application?.jobId && item.companyId === employer?.companyId);
  if (!application || !job) return response.status(404).json({ error: 'Application not found for this company.' });
  const candidate = database.jobSeekers.find((profile) => profile.userId === application.jobSeekerUserId);
  const storedFileName = application.resumePath || candidate?.resume?.storedFileName;
  const resumePath = storedFileName ? path.join(uploadDirectory, path.basename(storedFileName)) : null;
  if (!resumePath || !fs.existsSync(resumePath)) return response.status(404).json({ error: 'Candidate resume not found.' });
  response.download(resumePath, candidate?.resume?.originalFileName || 'candidate-resume');
});

app.put('/api/employer/jobs/:jobId/status', authenticate, requireAccountType('employer'), (request, response) => {
  const allowed = new Set(['published', 'paused', 'closed']);
  const status = clean(request.body.status);
  if (!allowed.has(status)) return response.status(400).json({ error: 'Choose published, paused, or closed.' });
  const database = readDatabase();
  const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
  const job = database.jobs.find((item) => item.id === Number(request.params.jobId) && item.companyId === employer?.companyId);
  if (!job) return response.status(404).json({ error: 'Job not found for this company.' });
  job.status = status; job.updatedAt = now();
  database.auditLogs.push({ userId: employer.userId, action: `job.${status}`, createdAt: now() });
  saveDatabase(database);
  response.json({ message: 'Job status updated.', job });
});

app.put('/api/employer/applications/:applicationId/status', authenticate, requireAccountType('employer'), (request, response) => {
  const allowed = new Set(['viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected']);
  const status = clean(request.body.status);
  if (!allowed.has(status)) return response.status(400).json({ error: 'Choose a valid application status.' });
  const database = readDatabase();
  const employer = database.employers.find((profile) => String(profile.userId) === String(request.auth.sub));
  const application = database.applications.find((item) => item.id === Number(request.params.applicationId));
  const job = database.jobs.find((item) => item.id === application?.jobId && item.companyId === employer?.companyId);
  if (!application || !job) return response.status(404).json({ error: 'Application not found for this company.' });
  application.status = status; application.updatedAt = now();
  database.auditLogs.push({ userId: employer.userId, action: `application.${status}`, createdAt: now() });
  saveDatabase(database);
  response.json({ message: 'Applicant status updated.', application });
});

app.post('/api/job-seekers/register', authLimiter, async (request, response, next) => {
  try {
    const required = missing(request.body, ['firstName', 'lastName', 'email', 'password', 'confirmPassword']);
    if (required.length) return response.status(400).json({ error: `Missing required fields: ${required.join(', ')}` });
    if (request.body.password.length < 8) return response.status(400).json({ error: 'Password must contain at least 8 characters.' });
    if (request.body.password !== request.body.confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' });

    const database = readDatabase();
    const email = normalizeEmail(request.body.email);
    if (database.users.some((user) => user.email === email)) return response.status(409).json({ error: 'An account already exists for this email.' });

    const user = {
      id: nextId(database, 'user'),
      email,
      passwordHash: await bcrypt.hash(request.body.password, 12),
      accountType: 'job_seeker',
      accountStatus: 'active',
      createdAt: now(),
      lastLoginAt: null,
    };
    const profile = {
      id: nextId(database, 'profile'),
      userId: user.id,
      firstName: clean(request.body.firstName),
      lastName: clean(request.body.lastName),
      createdAt: now(),
      updatedAt: now(),
    };
    database.users.push(user);
    database.jobSeekers.push(profile);
    database.auditLogs.push({ userId: user.id, action: 'job_seeker.registered', createdAt: now() });
    saveDatabase(database);

    response.status(201).json({
      message: 'Job seeker account created.',
      accessToken: issueToken(user),
      user: { id: user.id, email, accountType: user.accountType, firstName: profile.firstName, lastName: profile.lastName },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/employers/register', authLimiter, upload.fields([{ name: 'document', maxCount: 1 }, { name: 'companyLogo', maxCount: 1 }]), async (request, response, next) => {
  try {
    const documentFile = request.files?.document?.[0];
    const logoFile = request.files?.companyLogo?.[0];
    if (logoFile && logoFile.size > 2 * 1024 * 1024) {
      removeFile(documentFile); removeFile(logoFile);
      return response.status(400).json({ error: 'Company logo must be smaller than 2 MB.' });
    }
    const requiredFields = [
      'firstName', 'lastName', 'workEmail', 'phone', 'designation', 'password', 'confirmPassword',
      'legalName', 'website', 'companyType', 'industry', 'companySize', 'address', 'city', 'state',
      'postalCode', 'companyAbout', 'documentType',
    ];
    if (missing(request.body, requiredFields).length || !documentFile || !request.body.authorization || !request.body.terms) {
      removeFile(documentFile); removeFile(logoFile);
      return response.status(400).json({ error: 'Complete all required company, document, and authorization fields.' });
    }
    if (request.body.password !== request.body.confirmPassword) {
      removeFile(documentFile); removeFile(logoFile);
      return response.status(400).json({ error: 'Passwords do not match.' });
    }

    const database = readDatabase();
    const email = normalizeEmail(request.body.workEmail);
    const existingUser = database.users.find((user) => user.email === email);
    if (existingUser) {
      removeFile(documentFile); removeFile(logoFile);
      const accountLabel = existingUser.accountType === 'job_seeker' ? 'candidate' : existingUser.accountType;
      return response.status(409).json({ error: `This work email is already registered as a ${accountLabel} account. Use a different work email, or sign in to the existing account.` });
    }

    const company = {
      id: nextId(database, 'company'), legalName: clean(request.body.legalName), brandName: clean(request.body.brandName),
      website: clean(request.body.website), companyType: clean(request.body.companyType), industry: clean(request.body.industry),
      companySize: clean(request.body.companySize), foundedYear: clean(request.body.founded) || null,
      description: clean(request.body.companyAbout), address: clean(request.body.address), city: clean(request.body.city),
      state: clean(request.body.state), postalCode: clean(request.body.postalCode), cin: clean(request.body.cin) || null,
      gstin: clean(request.body.gstin) || null, logoPath: logoFile?.filename || '', logoMimeType: logoFile?.mimetype || '', verificationStatus: 'pending', createdAt: now(),
    };
    const user = {
      id: nextId(database, 'user'), email, passwordHash: await bcrypt.hash(request.body.password, 12),
      accountType: 'employer', accountStatus: 'active', createdAt: now(), lastLoginAt: null,
    };
    const employer = {
      id: nextId(database, 'profile'), userId: user.id, companyId: company.id,
      firstName: clean(request.body.firstName), lastName: clean(request.body.lastName),
      phoneCountryCode: clean(request.body.phoneCountryCode) || '+91', phone: clean(request.body.phone),
      designation: clean(request.body.designation), authorized: true, createdAt: now(),
    };
    const document = {
      id: nextId(database, 'document'), companyId: company.id, uploadedByUserId: user.id,
      documentType: clean(request.body.documentType), originalFileName: documentFile.originalname,
      storedFileName: documentFile.filename, mimeType: documentFile.mimetype, size: documentFile.size,
      verificationStatus: 'pending', createdAt: now(),
    };
    database.companies.push(company);
    database.users.push(user);
    database.employers.push(employer);
    database.documents.push(document);
    database.auditLogs.push({ userId: user.id, action: 'employer.registered', companyId: company.id, createdAt: now() });
    saveDatabase(database);

    response.status(201).json({
      message: 'Company registration submitted for verification.',
      applicationReference: `CAR-EMP-${String(company.id).padStart(6, '0')}`,
      company: { id: company.id, legalName: company.legalName, verificationStatus: company.verificationStatus },
    });
  } catch (error) {
    removeFile(request.files?.document?.[0]); removeFile(request.files?.companyLogo?.[0]);
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const password = clean(request.body.password);
    const database = readDatabase();
    const user = database.users.find((candidate) => candidate.email === email);
    const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) return response.status(401).json({ error: 'Incorrect email or password.' });
    if (request.body.accountType && user.accountType !== request.body.accountType) {
      return response.status(403).json({ error: `This email is registered as a ${user.accountType.replace('_', ' ')} account.` });
    }

    user.lastLoginAt = now();
    database.auditLogs.push({ userId: user.id, action: 'auth.login', createdAt: now() });
    saveDatabase(database);
    const employer = database.employers.find((profile) => profile.userId === user.id);
    const company = employer ? database.companies.find((item) => item.id === employer.companyId) : null;

    response.json({
      message: 'Signed in successfully.',
      accessToken: issueToken(user, company ? { companyId: company.id } : {}),
      user: { id: user.id, email: user.email, accountType: user.accountType },
      company: company ? { id: company.id, legalName: company.legalName, brandName: company.brandName, verificationStatus: company.verificationStatus } : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', authenticate, (request, response) => {
  const database = readDatabase();
  const user = database.users.find((item) => String(item.id) === String(request.auth.sub));
  if (!user) return response.status(404).json({ error: 'Account not found.' });
  response.json({ user: { id: user.id, email: user.email, accountType: user.accountType, accountStatus: user.accountStatus, createdAt: user.createdAt } });
});

app.get('/api/job-seekers/me', authenticate, requireAccountType('job_seeker'), (request, response) => {
  const database = readDatabase();
  const profile = database.jobSeekers.find((item) => String(item.userId) === String(request.auth.sub));
  if (!profile) return response.status(404).json({ error: 'Job seeker profile not found.' });
  const user = database.users.find((item) => String(item.id) === String(request.auth.sub));
  response.json({ profile: { ...profile, email: user?.email || '' }, completion: profileCompletion(profile) });
});

app.put('/api/job-seekers/me', authenticate, requireAccountType('job_seeker'), profileUpload, (request, response, next) => {
  try {
    const resumeFile = request.files?.resume?.[0];
    const profilePhotoFile = request.files?.profilePhoto?.[0];
    const database = readDatabase();
    const profile = database.jobSeekers.find((item) => String(item.userId) === String(request.auth.sub));
    if (!profile) {
      removeFile(resumeFile);
      removeFile(profilePhotoFile);
      return response.status(404).json({ error: 'Job seeker profile not found.' });
    }

    const scalarFields = [
      'firstName', 'lastName', 'phone', 'headline', 'professionalSummary', 'city', 'state', 'country',
      'portfolioUrl', 'linkedinUrl', 'currentJobTitle', 'currentCompany', 'experienceYears',
      'employmentStatus', 'salaryExpectation', 'noticePeriod', 'profileVisibility',
    ];
    scalarFields.forEach((field) => { profile[field] = clean(request.body[field]); });
    profile.preferredRoles = cleanList(request.body.preferredRoles, 10);
    profile.preferredLocations = cleanList(request.body.preferredLocations, 10);
    profile.workModes = cleanList(request.body.workModes, 5);
    profile.skills = cleanList(request.body.skills, 40);
    profile.languages = cleanList(request.body.languages, 12);
    profile.experience = cleanRecords(request.body.experience, ['title', 'company', 'location', 'startDate', 'endDate', 'description'], 20);
    profile.education = cleanRecords(request.body.education, ['degree', 'field', 'institution', 'startYear', 'endYear', 'grade'], 15);
    profile.projects = cleanRecords(request.body.projects, ['name', 'role', 'url', 'description'], 15);
    profile.certifications = cleanRecords(request.body.certifications, ['name', 'issuer', 'year', 'credentialUrl'], 15);

    if (resumeFile) {
      const previousResume = profile.resume?.storedFileName ? path.join(uploadDirectory, path.basename(profile.resume.storedFileName)) : null;
      profile.resume = {
        originalFileName: resumeFile.originalname,
        storedFileName: resumeFile.filename,
        mimeType: resumeFile.mimetype,
        size: resumeFile.size,
        uploadedAt: now(),
      };
      if (previousResume && fs.existsSync(previousResume)) fs.promises.unlink(previousResume).catch(() => {});
    }
    if (profilePhotoFile) {
      if (profilePhotoFile.size > 2 * 1024 * 1024) {
        removeFile(profilePhotoFile);
        removeFile(resumeFile);
        return response.status(400).json({ error: 'Profile photo must be smaller than 2 MB.' });
      }
      const previousPhoto = profile.profilePhoto?.storedFileName ? path.join(uploadDirectory, path.basename(profile.profilePhoto.storedFileName)) : null;
      profile.profilePhoto = { storedFileName: profilePhotoFile.filename, mimeType: profilePhotoFile.mimetype, uploadedAt: now() };
      if (previousPhoto && fs.existsSync(previousPhoto)) fs.promises.unlink(previousPhoto).catch(() => {});
    }
    profile.updatedAt = now();
    database.auditLogs.push({ userId: profile.userId, action: 'job_seeker.profile_updated', createdAt: now() });
    saveDatabase(database);
    const user = database.users.find((item) => String(item.id) === String(request.auth.sub));
    response.json({
      message: 'Profile saved successfully.',
      profile: { ...profile, email: user?.email || '' },
      completion: profileCompletion(profile),
    });
  } catch (error) {
    removeFile(request.files?.resume?.[0]);
    removeFile(request.files?.profilePhoto?.[0]);
    next(error);
  }
});

app.get('/api/job-seekers/me/resume', authenticate, requireAccountType('job_seeker'), (request, response) => {
  const database = readDatabase();
  const profile = database.jobSeekers.find((item) => String(item.userId) === String(request.auth.sub));
  const storedFileName = profile?.resume?.storedFileName;
  if (!storedFileName) return response.status(404).json({ error: 'No resume has been uploaded.' });
  const resumePath = path.join(uploadDirectory, path.basename(storedFileName));
  if (!fs.existsSync(resumePath)) return response.status(404).json({ error: 'The uploaded resume could not be found.' });
  response.download(resumePath, profile.resume.originalFileName);
});

app.get('/api/job-seekers/me/photo', authenticate, requireAccountType('job_seeker'), (request, response) => {
  const profile = readDatabase().jobSeekers.find((item) => String(item.userId) === String(request.auth.sub));
  const storedFileName = profile?.profilePhoto?.storedFileName;
  if (!storedFileName) return response.status(404).json({ error: 'No profile photo has been uploaded.' });
  const photoPath = path.join(uploadDirectory, path.basename(storedFileName));
  if (!fs.existsSync(photoPath)) return response.status(404).json({ error: 'The uploaded profile photo could not be found.' });
  response.type(profile.profilePhoto.mimeType || 'image/jpeg').sendFile(photoPath);
});

app.get('/api/employers/me', authenticate, (request, response) => {
  const database = readDatabase();
  const profile = database.employers.find((item) => String(item.userId) === String(request.auth.sub));
  if (!profile) return response.status(404).json({ error: 'Employer profile not found.' });
  const company = database.companies.find((item) => item.id === profile.companyId);
  const hiring = database.hiringPreferences.find((item) => item.companyId === profile.companyId);
  response.json({ profile: { ...profile, company }, hiringTeams: hiring?.teams || [] });
});

const privatePaths = new Set(['uploads', 'data', 'database', 'node_modules']);
const privateFiles = new Set(['server.js', 'local-server.js', 'package.json', 'package-lock.json', 'DATABASE_SETUP.md', '.env', '.env.example', '.gitignore']);
app.use((request, response, next) => {
  const firstSegment = request.path.split('/').filter(Boolean)[0] || '';
  if (privatePaths.has(firstSegment) || privateFiles.has(firstSegment) || firstSegment.startsWith('.env')) {
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
  response.status(500).json({ error: 'An unexpected server error occurred.', detail: error.message });
});

app.listen(port, () => {
  console.log(`Careerly local server is running at http://localhost:${port}`);
  console.log('Local development data is stored in database/careerly.sqlite');
});
