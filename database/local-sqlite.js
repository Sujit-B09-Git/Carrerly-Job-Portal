const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const schemaFile = path.join(__dirname, 'schema.sql');
const databaseFile = path.join(__dirname, 'careerly.sqlite');
const db = new DatabaseSync(databaseFile);
// DELETE journaling keeps records in the .sqlite file itself, which makes the file
// immediately inspectable by SQLite Viewer without relying on a companion WAL file.
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(schemaFile, 'utf8'));
// Existing local databases predate profile photos; keep this small migration idempotent.
const profileColumns = new Set(db.prepare('PRAGMA table_info(job_seeker_profiles)').all().map((column) => column.name));
if (!profileColumns.has('profile_photo_path')) db.exec('ALTER TABLE job_seeker_profiles ADD COLUMN profile_photo_path TEXT');
if (!profileColumns.has('profile_photo_mime_type')) db.exec('ALTER TABLE job_seeker_profiles ADD COLUMN profile_photo_mime_type TEXT');
const companyColumns = new Set(db.prepare('PRAGMA table_info(companies)').all().map((column) => column.name));
if (!companyColumns.has('logo_path')) db.exec('ALTER TABLE companies ADD COLUMN logo_path TEXT');
if (!companyColumns.has('logo_mime_type')) db.exec('ALTER TABLE companies ADD COLUMN logo_mime_type TEXT');

const rows = (sql, ...values) => db.prepare(sql).all(...values).map((row) => ({ ...row }));
const row = (sql, ...values) => { const result = db.prepare(sql).get(...values); return result ? { ...result } : null; };
const run = (sql, ...values) => db.prepare(sql).run(...values);
const insert = (table, values) => {
  const columns = Object.keys(values);
  run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map((key) => values[key]));
};
const list = (sql, ...values) => rows(sql, ...values).map(Object.values);
const timestamp = () => new Date().toISOString();

function readDatabase() {
  const users = rows('SELECT * FROM users ORDER BY id').map((item) => ({
    id: item.id, email: item.email, passwordHash: item.password_hash, accountType: item.account_type,
    accountStatus: item.account_status, createdAt: item.created_at, lastLoginAt: item.last_login_at,
  }));
  const jobSeekers = rows('SELECT * FROM job_seeker_profiles ORDER BY id').map((item) => {
    const preference = row('SELECT id FROM candidate_job_preferences WHERE job_seeker_profile_id = ?', item.id);
    const child = (table, field) => preference ? list(`SELECT ${field} FROM ${table} WHERE preference_id = ? ORDER BY sort_order, id`, preference.id).flat() : [];
    return {
      id: item.id, userId: item.user_id, firstName: item.first_name, lastName: item.last_name, phone: item.phone || '', headline: item.headline || '',
      professionalSummary: item.professional_summary || '', city: item.city || '', state: item.state || '', country: item.country || '',
      experienceYears: item.experience_years ?? '', currentCompany: item.current_company || '', currentJobTitle: item.current_job_title || '',
      portfolioUrl: item.portfolio_url || '', linkedinUrl: item.linkedin_url || '', employmentStatus: item.employment_status || '',
      salaryExpectation: item.salary_expectation || '', noticePeriod: item.notice_period || '', profileVisibility: item.profile_visibility,
      resume: item.resume_path ? { originalFileName: item.resume_original_name, storedFileName: item.resume_path, mimeType: item.resume_mime_type, size: item.resume_size_bytes } : undefined,
      profilePhoto: item.profile_photo_path ? { storedFileName: item.profile_photo_path, mimeType: item.profile_photo_mime_type } : undefined,
      preferredRoles: child('candidate_preferred_roles', 'role_name'), preferredLocations: child('candidate_preferred_locations', 'location_name'), workModes: child('candidate_work_modes', 'work_mode'),
      skills: list('SELECT skill_name FROM candidate_skills WHERE job_seeker_profile_id = ? ORDER BY id', item.id).flat(),
      languages: list('SELECT language_name FROM candidate_languages WHERE job_seeker_profile_id = ? ORDER BY id', item.id).flat(),
      experience: rows('SELECT * FROM candidate_work_experiences WHERE job_seeker_profile_id = ? ORDER BY sort_order,id', item.id).map((x) => ({ title:x.job_title, company:x.company_name, location:x.location || '', startDate:x.start_date || '', endDate:x.end_date || '', description:x.description || '' })),
      education: rows('SELECT * FROM candidate_educations WHERE job_seeker_profile_id = ? ORDER BY sort_order,id', item.id).map((x) => ({ degree:x.degree, field:x.field_of_study || '', institution:x.institution, startYear:x.start_year || '', endYear:x.end_year || '', grade:x.grade || '' })),
      projects: rows('SELECT * FROM candidate_projects WHERE job_seeker_profile_id = ? ORDER BY sort_order,id', item.id).map((x) => ({ name:x.project_name, role:x.role_name || '', url:x.project_url || '', description:x.description || '' })),
      certifications: rows('SELECT * FROM candidate_certifications WHERE job_seeker_profile_id = ? ORDER BY sort_order,id', item.id).map((x) => ({ name:x.certification_name, issuer:x.issuer || '', year:x.issue_year || '', credentialUrl:x.credential_url || '' })),
      createdAt:item.created_at, updatedAt:item.updated_at,
    };
  });
  const companies = rows('SELECT * FROM companies ORDER BY id').map((x) => ({ id:x.id, legalName:x.legal_name, brandName:x.brand_name || '', website:x.website, companyType:x.company_type, industry:x.industry, companySize:x.company_size, foundedYear:x.founded_year || null, description:x.description, address:x.registered_address, city:x.city, state:x.state, postalCode:x.postal_code, cin:x.cin, gstin:x.gstin, logoPath:x.logo_path || '', logoMimeType:x.logo_mime_type || '', verificationStatus:x.verification_status, createdAt:x.created_at }));
  const employers = rows('SELECT * FROM employer_profiles ORDER BY id').map((x) => ({ id:x.id,userId:x.user_id,companyId:x.company_id,firstName:x.first_name,lastName:x.last_name,phoneCountryCode:x.phone_country_code,phone:x.phone,designation:x.designation,authorized:Boolean(x.is_primary_authorized_representative),createdAt:x.created_at }));
  const documents = rows('SELECT * FROM company_documents ORDER BY id').map((x) => ({ id:x.id,companyId:x.company_id,uploadedByUserId:x.uploaded_by_user_id,documentType:x.document_type,originalFileName:x.original_file_name,storedFileName:x.stored_file_name,mimeType:x.mime_type,size:x.file_size_bytes,verificationStatus:x.verification_status,createdAt:x.created_at }));
  const hiringPreferences = rows('SELECT * FROM hiring_preferences ORDER BY id').map((x) => ({ id:x.id,companyId:x.company_id,teams:list('SELECT team_name FROM hiring_preference_teams WHERE hiring_preference_id=? ORDER BY id',x.id).flat(),expectedHires:x.expected_hires,startTimeline:x.hiring_start_timeline,workModel:x.work_model,location:x.primary_hiring_location,experience:x.experience_level,createdAt:x.created_at }));
  const auditLogs = rows('SELECT * FROM audit_logs ORDER BY id').map((x) => ({ userId:x.user_id,action:x.action,createdAt:x.created_at }));
  const jobs = rows('SELECT * FROM jobs ORDER BY created_at DESC,id DESC').map((x) => ({ id:x.id,companyId:x.company_id,createdByUserId:x.created_by_user_id,title:x.title,department:x.department || '',description:x.description,employmentType:x.employment_type,workModel:x.work_model,city:x.city || '',state:x.state || '',country:x.country,minExperienceYears:x.min_experience_years ?? '',maxExperienceYears:x.max_experience_years ?? '',salaryMin:x.salary_min ?? '',salaryMax:x.salary_max ?? '',currency:x.currency,status:x.status,publishedAt:x.published_at,createdAt:x.created_at,updatedAt:x.updated_at,skills:list('SELECT skill_name FROM job_skills WHERE job_id=? ORDER BY sort_order,id',x.id).flat() }));
  const applications = rows('SELECT * FROM job_applications ORDER BY applied_at DESC,id DESC').map((x) => ({ id:x.id,jobId:x.job_id,jobSeekerUserId:x.job_seeker_user_id,coverLetter:x.cover_letter || '',resumePath:x.resume_path || '',status:x.status,appliedAt:x.applied_at,updatedAt:x.updated_at }));
  return { counters:{ user:Math.max(0,...users.map(x=>x.id)), profile:Math.max(0,...jobSeekers.map(x=>x.id),...employers.map(x=>x.id)), company:Math.max(0,...companies.map(x=>x.id)), document:Math.max(0,...documents.map(x=>x.id)), preference:Math.max(0,...hiringPreferences.map(x=>x.id)), job:Math.max(0,...jobs.map(x=>x.id)), application:Math.max(0,...applications.map(x=>x.id)) }, users,jobSeekers,companies,employers,documents,hiringPreferences,jobs,applications,auditLogs };
}

function saveDatabase(data) {
  db.exec('BEGIN IMMEDIATE');
  try {
    ['audit_logs','job_applications','job_skills','jobs','hiring_preference_teams','hiring_preferences','company_documents','employer_profiles','companies','candidate_preferred_roles','candidate_preferred_locations','candidate_work_modes','candidate_job_preferences','candidate_skills','candidate_languages','candidate_work_experiences','candidate_educations','candidate_projects','candidate_certifications','job_seeker_profiles','users'].forEach((table) => db.exec(`DELETE FROM ${table}`));
    data.users.forEach((x) => insert('users',{id:x.id,email:x.email,password_hash:x.passwordHash,account_type:x.accountType,account_status:x.accountStatus,email_verified_at:null,last_login_at:x.lastLoginAt,created_at:x.createdAt || timestamp(),updated_at:timestamp()}));
    data.companies.forEach((x) => insert('companies',{id:x.id,legal_name:x.legalName,brand_name:x.brandName || null,website:x.website,company_type:x.companyType,industry:x.industry,company_size:x.companySize,founded_year:x.foundedYear || null,description:x.description,registered_address:x.address,city:x.city,state:x.state,country:'India',postal_code:x.postalCode,cin:x.cin || null,gstin:x.gstin || null,logo_path:x.logoPath || null,logo_mime_type:x.logoMimeType || null,verification_status:x.verificationStatus,verified_at:null,created_at:x.createdAt || timestamp(),updated_at:timestamp()}));
    data.jobSeekers.forEach((x) => {
      insert('job_seeker_profiles',{id:x.id,user_id:x.userId,first_name:x.firstName,last_name:x.lastName,phone:x.phone || null,headline:x.headline || null,professional_summary:x.professionalSummary || null,city:x.city || null,state:x.state || null,country:x.country || 'India',experience_years:x.experienceYears || null,current_company:x.currentCompany || null,current_job_title:x.currentJobTitle || null,portfolio_url:x.portfolioUrl || null,linkedin_url:x.linkedinUrl || null,employment_status:x.employmentStatus || null,salary_expectation:x.salaryExpectation || null,notice_period:x.noticePeriod || null,resume_path:x.resume?.storedFileName || null,resume_original_name:x.resume?.originalFileName || null,resume_mime_type:x.resume?.mimeType || null,resume_size_bytes:x.resume?.size || null,profile_photo_path:x.profilePhoto?.storedFileName || null,profile_photo_mime_type:x.profilePhoto?.mimeType || null,profile_visibility:x.profileVisibility || 'employers_only',created_at:x.createdAt || timestamp(),updated_at:x.updatedAt || timestamp()});
      (x.skills || []).forEach((v) => insert('candidate_skills',{job_seeker_profile_id:x.id,skill_name:v,created_at:timestamp()})); (x.languages || []).forEach((v) => insert('candidate_languages',{job_seeker_profile_id:x.id,language_name:v,created_at:timestamp()}));
      [['candidate_work_experiences',x.experience || [],{job_title:'title',company_name:'company',location:'location',start_date:'startDate',end_date:'endDate',description:'description'}],['candidate_educations',x.education || [],{degree:'degree',field_of_study:'field',institution:'institution',start_year:'startYear',end_year:'endYear',grade:'grade'}],['candidate_projects',x.projects || [],{project_name:'name',role_name:'role',project_url:'url',description:'description'}],['candidate_certifications',x.certifications || [],{certification_name:'name',issuer:'issuer',issue_year:'year',credential_url:'credentialUrl'}]].forEach(([table,items,map]) => items.forEach((item,index) => { const values={job_seeker_profile_id:x.id,sort_order:index,created_at:timestamp()}; Object.entries(map).forEach(([column,key])=>values[column]=item[key] || null); insert(table,values); }));
      insert('candidate_job_preferences',{job_seeker_profile_id:x.id,created_at:timestamp(),updated_at:timestamp()}); const pref=row('SELECT id FROM candidate_job_preferences WHERE job_seeker_profile_id=?',x.id);
      [['candidate_preferred_roles',x.preferredRoles || [],'role_name'],['candidate_preferred_locations',x.preferredLocations || [],'location_name'],['candidate_work_modes',x.workModes || [],'work_mode']].forEach(([table,items,column])=>items.forEach((value,index)=>insert(table,{preference_id:pref.id,[column]:value,sort_order:index})));
    });
    data.employers.forEach((x) => insert('employer_profiles',{id:x.id,user_id:x.userId,company_id:x.companyId,first_name:x.firstName,last_name:x.lastName,phone_country_code:x.phoneCountryCode || '+91',phone:x.phone,designation:x.designation,is_primary_authorized_representative:x.authorized ? 1 : 0,authorization_confirmed_at:x.createdAt || timestamp(),created_at:x.createdAt || timestamp(),updated_at:timestamp()}));
    data.documents.forEach((x) => insert('company_documents',{id:x.id,company_id:x.companyId,uploaded_by_user_id:x.uploadedByUserId,document_type:x.documentType,original_file_name:x.originalFileName,stored_file_name:x.storedFileName,stored_path:x.storedFileName,mime_type:x.mimeType,file_size_bytes:x.size,verification_status:x.verificationStatus,reviewer_notes:null,reviewed_at:null,created_at:x.createdAt || timestamp()}));
    data.hiringPreferences.forEach((x) => { insert('hiring_preferences',{id:x.id,company_id:x.companyId,expected_hires:x.expectedHires,hiring_start_timeline:x.startTimeline,work_model:x.workModel,primary_hiring_location:x.location,experience_level:x.experience,created_at:x.createdAt || timestamp(),updated_at:timestamp()}); (x.teams || []).forEach((team) => insert('hiring_preference_teams',{hiring_preference_id:x.id,team_name:team})); });
    (data.jobs || []).forEach((x) => insert('jobs',{id:x.id,company_id:x.companyId,created_by_user_id:x.createdByUserId,title:x.title,department:x.department || null,description:x.description,employment_type:x.employmentType,work_model:x.workModel,city:x.city || null,state:x.state || null,country:x.country || 'India',min_experience_years:x.minExperienceYears || null,max_experience_years:x.maxExperienceYears || null,salary_min:x.salaryMin || null,salary_max:x.salaryMax || null,currency:x.currency || 'INR',status:x.status || 'published',published_at:x.publishedAt || timestamp(),created_at:x.createdAt || timestamp(),updated_at:x.updatedAt || timestamp()}));
    (data.jobs || []).forEach((x) => (x.skills || []).forEach((skill,index) => insert('job_skills',{job_id:x.id,skill_name:skill,sort_order:index})));
    (data.applications || []).forEach((x) => insert('job_applications',{id:x.id,job_id:x.jobId,job_seeker_user_id:x.jobSeekerUserId,cover_letter:x.coverLetter || null,resume_path:x.resumePath || null,status:x.status || 'submitted',applied_at:x.appliedAt || timestamp(),updated_at:x.updatedAt || timestamp()}));
    data.auditLogs.forEach((x) => insert('audit_logs',{user_id:x.userId || null,action:x.action,entity_type:'system',entity_id:null,ip_address:null,metadata:null,created_at:x.createdAt || timestamp()}));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

module.exports = { databaseFile, readDatabase, saveDatabase };
