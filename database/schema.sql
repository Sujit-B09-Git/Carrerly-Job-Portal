-- Careerly SQLite schema. Open database/careerly.sqlite with VS Code SQLite Viewer.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('job_seeker','employer','admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending','active','suspended','deleted')),
  email_verified_at TEXT, last_login_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS job_seeker_profiles (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT, headline TEXT, professional_summary TEXT, city TEXT, state TEXT,
  country TEXT NOT NULL DEFAULT 'India', experience_years REAL, current_company TEXT, current_job_title TEXT, portfolio_url TEXT, linkedin_url TEXT,
  employment_status TEXT, salary_expectation TEXT, notice_period TEXT, resume_path TEXT, resume_original_name TEXT, resume_mime_type TEXT,
  resume_size_bytes INTEGER CHECK(resume_size_bytes IS NULL OR resume_size_bytes >= 0),
  profile_photo_path TEXT, profile_photo_mime_type TEXT,
  profile_visibility TEXT NOT NULL DEFAULT 'employers_only' CHECK(profile_visibility IN ('public','employers_only','private')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_work_experiences (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL, company_name TEXT NOT NULL, location TEXT, start_date TEXT, end_date TEXT, description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_educations (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  degree TEXT NOT NULL, field_of_study TEXT, institution TEXT NOT NULL, start_year TEXT, end_year TEXT, grade TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_skills (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(job_seeker_profile_id,skill_name)
);
CREATE TABLE IF NOT EXISTS candidate_projects (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL, role_name TEXT, project_url TEXT, description TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_certifications (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  certification_name TEXT NOT NULL, issuer TEXT, issue_year TEXT, credential_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_languages (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  language_name TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(job_seeker_profile_id,language_name)
);
CREATE TABLE IF NOT EXISTS candidate_job_preferences (
  id INTEGER PRIMARY KEY, job_seeker_profile_id INTEGER NOT NULL UNIQUE REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidate_preferred_roles (
  id INTEGER PRIMARY KEY, preference_id INTEGER NOT NULL REFERENCES candidate_job_preferences(id) ON DELETE CASCADE, role_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(preference_id,role_name)
);
CREATE TABLE IF NOT EXISTS candidate_preferred_locations (
  id INTEGER PRIMARY KEY, preference_id INTEGER NOT NULL REFERENCES candidate_job_preferences(id) ON DELETE CASCADE, location_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(preference_id,location_name)
);
CREATE TABLE IF NOT EXISTS candidate_work_modes (
  id INTEGER PRIMARY KEY, preference_id INTEGER NOT NULL REFERENCES candidate_job_preferences(id) ON DELETE CASCADE,
  work_mode TEXT NOT NULL CHECK(work_mode IN ('On-site','Hybrid','Remote')), sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(preference_id,work_mode)
);
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY, legal_name TEXT NOT NULL, brand_name TEXT, website TEXT NOT NULL, company_type TEXT NOT NULL, industry TEXT NOT NULL, company_size TEXT NOT NULL,
  founded_year INTEGER, description TEXT NOT NULL, registered_address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'India', postal_code TEXT NOT NULL,
  cin TEXT UNIQUE, gstin TEXT UNIQUE, logo_path TEXT, logo_mime_type TEXT, verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','under_review','verified','rejected')),
  verified_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employer_profiles (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone_country_code TEXT NOT NULL DEFAULT '+91', phone TEXT NOT NULL, designation TEXT NOT NULL,
  is_primary_authorized_representative INTEGER NOT NULL DEFAULT 1 CHECK(is_primary_authorized_representative IN (0,1)), authorization_confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS company_documents (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL, original_file_name TEXT NOT NULL, stored_file_name TEXT NOT NULL, stored_path TEXT NOT NULL, mime_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes >= 0),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','approved','rejected')), reviewer_notes TEXT, reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hiring_preferences (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE, expected_hires TEXT NOT NULL, hiring_start_timeline TEXT NOT NULL,
  work_model TEXT NOT NULL, primary_hiring_location TEXT NOT NULL, experience_level TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hiring_preference_teams (
  id INTEGER PRIMARY KEY, hiring_preference_id INTEGER NOT NULL REFERENCES hiring_preferences(id) ON DELETE CASCADE, team_name TEXT NOT NULL COLLATE NOCASE, UNIQUE(hiring_preference_id,team_name)
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, department TEXT, description TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK(employment_type IN ('full_time','part_time','contract','internship','temporary')),
  work_model TEXT NOT NULL CHECK(work_model IN ('onsite','hybrid','remote')),
  city TEXT, state TEXT, country TEXT NOT NULL DEFAULT 'India', min_experience_years REAL, max_experience_years REAL,
  salary_min REAL, salary_max REAL, currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','paused','closed')),
  published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS job_applications (
  id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_seeker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT, resume_path TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','viewed','shortlisted','interview','offered','hired','rejected','withdrawn')),
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id,job_seeker_user_id)
);
CREATE TABLE IF NOT EXISTS job_skills (
  id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL COLLATE NOCASE, sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(job_id,skill_name)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL DEFAULT 'system', entity_id INTEGER, ip_address TEXT, metadata TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_type_status ON users(account_type,account_status);
CREATE INDEX IF NOT EXISTS idx_experience_profile ON candidate_work_experiences(job_seeker_profile_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_education_profile ON candidate_educations(job_seeker_profile_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_companies_verification ON companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_employer_company ON employer_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_company ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company_status ON jobs(company_id,status);
CREATE INDEX IF NOT EXISTS idx_jobs_public_search ON jobs(status,title,city,work_model);
CREATE INDEX IF NOT EXISTS idx_applications_job_status ON job_applications(job_id,status);
CREATE INDEX IF NOT EXISTS idx_job_skills_name ON job_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_logs(user_id,created_at);
