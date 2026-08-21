# Careerly database setup

## Local SQLite database (recommended for development)

The default server uses the real SQLite database at `database/careerly.sqlite`; it is not a browser-based or custom database viewer. Open that file directly with the VS Code SQLite Viewer extension to inspect its tables, columns, foreign keys, indexes, and records.

```powershell
npm start
npm run db:inspect
```

On the first local-server startup, any existing `data/local-database.json` data is imported into SQLite. Candidate skills, education, work history, projects, certifications, languages, job preferences, and hiring teams are stored as relational rows in their own tables.

The app enables SQLite foreign-key enforcement for every connection. You can independently verify the database with `npm run db:inspect`; it reports any `PRAGMA foreign_key_check` violations.

## Optional MySQL setup

## 1. Install MySQL

Install MySQL Server 8.0 or newer and ensure the MySQL service is running.

## 2. Create the database

On this Windows machine, the quickest secure setup is:

```powershell
npm run setup:mysql
```

Enter the existing MySQL root password when prompted. The setup creates the database, generates a separate application password and JWT secret, and writes the ignored `.env` file automatically.

Alternatively, create it manually:

Open a MySQL administrator session and run:

```sql
SOURCE C:/Users/HP/OneDrive/Documents/ChatGPT/Job Portal/database/schema.sql;
```

Before using production data, replace the placeholder password in the final `CREATE USER` statement in `database/schema.sql`.

## 3. Configure the server

Copy `.env.example` to `.env` and set:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`
- A cryptographically random `JWT_SECRET` containing at least 32 characters

Do not commit `.env` or the `uploads` directory.

## 4. Install and run

```powershell
npm install
npm run start:mysql
```

Open `http://localhost:3000`. Do not open the HTML files directly because the forms require the API server.

## Data flow

- Candidate registration: `POST /api/job-seekers/register`
- Company registration with document: `POST /api/employers/register`
- Candidate or employer login: `POST /api/auth/login`
- Current account: `GET /api/me`
- Current candidate profile: `GET /api/job-seekers/me`
- Save candidate profile and optional resume: `PUT /api/job-seekers/me`
- Download the signed-in candidate's resume: `GET /api/job-seekers/me/resume`
- Current employer and company profile: `GET /api/employers/me`
- Public verified company: `GET /api/companies/:id`

Protected requests must include:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Passwords are hashed with bcrypt. Company registration is stored within a MySQL transaction so partial company records are rolled back if any step fails. Verification documents are private and cannot be downloaded through the static website.

The complete Careerly database and all relational tables are defined in `database/schema.sql`.
