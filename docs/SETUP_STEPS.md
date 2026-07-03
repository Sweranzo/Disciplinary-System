# Local Setup and Laptop Transfer Guide

This guide explains how to move the complete Disciplinary System to another
Windows laptop without losing users, cases, hearings, sanctions, notifications,
profile photos, or evidence files.

## Codex Laptop Restore Brief

Use this section as the first instruction for Codex on the new laptop.

Goal: run the transferred Disciplinary System with the exact existing records
and uploaded files from the old laptop.

Codex must preserve and restore these items:

```text
disciplinary_system_backup.sql      Complete MySQL database dump
database_counts.txt                 Old-laptop row counts for comparison
backend/uploads/avatars             Profile and student photos
backend/uploads/evidence            Evidence files linked from cases
backend.env.backup                  Private environment settings
backend/eng.traineddata             OCR language data used by the backend
backend/package-lock.json           Exact dependency lock file
```

Codex must install these requirements on the new laptop if missing:

```text
Node.js 20 LTS or newer LTS
MySQL Server 8.x or XAMPP with MySQL/MariaDB
Visual Studio Code
VS Code Live Server extension
Git, if cloning or version control is needed
```

Codex setup order on the new laptop:

1. Copy the complete project folder to `C:\Projects\Disciplinary-System`.
2. Restore the MySQL dump with `mysql.exe`.
3. Restore `backend/uploads` exactly as copied from the old laptop.
4. Restore `backend/.env` from `backend.env.backup`, then adjust only local
   MySQL credentials if needed.
5. Run `npm.cmd ci` inside `backend` to install dependencies from
   `package-lock.json`.
6. Start MySQL, then start the backend with `npm.cmd run dev`.
7. Serve the frontend on port `5500`.
8. Compare database counts with `database_counts.txt`.
9. Verify logins, cases, profile photos, and evidence links before deleting or
   changing the old laptop copy.

Important no-data-loss rules for Codex:

- Do not run `database/schema.sql` when restoring the transferred system.
- Do not run migration files after importing the complete dump.
- Do not use `DROP DATABASE` unless the user confirms the target database is
  disposable or a verified backup exists.
- Do not create a new empty `disciplinary_system` database over the restored
  data.
- Do not rename files inside `backend/uploads`.
- Do not replace `backend/.env` with `.env.example` unless no private backup
  exists.
- Do not delete the old laptop copy or backup package until verification passes.
- If `npm.cmd ci` fails because the lock file is out of sync, run
  `npm.cmd install`, then keep the updated `package-lock.json` with the project.

Use Part C for the restore commands, Part D for startup, and Part E for
verification.

## Read This First

The application data is stored in two places:

1. MySQL database `disciplinary_system`
2. Uploaded files under `backend/uploads`

Copying only the project folder or cloning the GitHub repository is not enough.
The database must be exported separately, and `backend/uploads` must be copied
because it is intentionally excluded from Git.

Do not share `backend/.env`, database dumps, or uploaded disciplinary records in
a public repository.

## Database Path Decision

Before touching MySQL, choose exactly one path:

| Situation | Safe action | Never do |
| --- | --- | --- |
| Moving this working app with real records | Import `disciplinary_system_backup.sql`, then restore `backend/uploads` and `.env` | Do not run `database/schema.sql` or migrations afterward |
| Creating a brand-new empty app | Create the database and run `database/schema.sql` once | Do not import an old dump afterward without backing up |
| Upgrading an older existing app | Back up first, identify the last applied migration, then run only newer files in numeric order | Do not rerun old migrations or the consolidated schema |

The current consolidated schema includes migrations `001` through `008`.
After restore or upgrade, the database should include 30 tables. Important
tables include `student_parents`, `case_evidence`, `email_logs`,
`case_conversations`, `conversation_participants`, and `case_messages`.

## Recommended Transfer Package

Create one private transfer folder containing:

```text
Disciplinary-System-Transfer/
|-- Disciplinary-System/          Complete project folder
|-- disciplinary_system_backup.sql
|-- database_counts.txt
|-- backend.env.backup
`-- CHECKSUMS.txt                 Optional integrity hashes
```

The copied project must include:

```text
backend/uploads/avatars/
backend/uploads/evidence/
backend/eng.traineddata
backend/package-lock.json
```

## Part A: Prepare the Old Laptop

### 1. Stop Data Changes

Before making the backup:

1. Ask all users to log out.
2. Stop reporting or editing cases.
3. Stop the backend server.
4. Keep MySQL running so it can be exported.

This prevents database records and uploaded files from changing at different
times during the backup.

### 2. Find `mysqldump.exe`

Common locations:

```text
C:\xampp\mysql\bin\mysqldump.exe
C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe
```

You can also search in PowerShell:

```powershell
Get-ChildItem C:\ -Filter mysqldump.exe -Recurse -ErrorAction SilentlyContinue
```

### 3. Export the Complete Database

Create a transfer directory:

```powershell
New-Item -ItemType Directory -Force "$HOME\Desktop\Disciplinary-System-Transfer"
```

For XAMPP, run:

```powershell
& "C:\xampp\mysql\bin\mysqldump.exe" `
  --user=root `
  --password `
  --databases disciplinary_system `
  --single-transaction `
  --routines `
  --triggers `
  --events `
  --default-character-set=utf8mb4 `
  --result-file="$HOME\Desktop\Disciplinary-System-Transfer\disciplinary_system_backup.sql"
```

For MySQL Server 8, replace the executable path:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
  --user=root `
  --password `
  --databases disciplinary_system `
  --single-transaction `
  --routines `
  --triggers `
  --events `
  --default-character-set=utf8mb4 `
  --result-file="$HOME\Desktop\Disciplinary-System-Transfer\disciplinary_system_backup.sql"
```

When prompted, enter the MySQL password. If the XAMPP root account has no
password, press Enter.

Using `--result-file` is important on Windows because it preserves the SQL file
encoding better than PowerShell output redirection.

Confirm the dump is not empty:

```powershell
Get-Item "$HOME\Desktop\Disciplinary-System-Transfer\disciplinary_system_backup.sql" |
  Select-Object FullName, Length, LastWriteTime
```

### 4. Record Database Counts

Save a simple comparison report from the old laptop:

```powershell
& "C:\xampp\mysql\bin\mysql.exe" `
  --user=root `
  --password `
  --database=disciplinary_system `
  --batch `
  --execute="SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users UNION ALL SELECT 'students', COUNT(*) FROM students UNION ALL SELECT 'parents', COUNT(*) FROM parents UNION ALL SELECT 'student_parents', COUNT(*) FROM student_parents UNION ALL SELECT 'cases', COUNT(*) FROM cases UNION ALL SELECT 'case_evidence', COUNT(*) FROM case_evidence UNION ALL SELECT 'hearings', COUNT(*) FROM hearings UNION ALL SELECT 'sanctions', COUNT(*) FROM sanctions UNION ALL SELECT 'appeals', COUNT(*) FROM appeals UNION ALL SELECT 'notifications', COUNT(*) FROM notifications UNION ALL SELECT 'sms_logs', COUNT(*) FROM sms_logs UNION ALL SELECT 'email_logs', COUNT(*) FROM email_logs UNION ALL SELECT 'case_conversations', COUNT(*) FROM case_conversations UNION ALL SELECT 'conversation_participants', COUNT(*) FROM conversation_participants UNION ALL SELECT 'case_messages', COUNT(*) FROM case_messages;" |
  Out-File `
    "$HOME\Desktop\Disciplinary-System-Transfer\database_counts.txt" `
    -Encoding utf8
```

Review it:

```powershell
Get-Content "$HOME\Desktop\Disciplinary-System-Transfer\database_counts.txt"
```

### 5. Copy the Project and Uploaded Files

Copy the project using File Explorer, or use `robocopy`. The command below
excludes Git internals and `node_modules`, but still includes `backend/uploads`:

```powershell
robocopy `
  "C:\Users\jeff\Desktop\Projects\Disciplinary-System" `
  "$HOME\Desktop\Disciplinary-System-Transfer\Disciplinary-System" `
  /E /XD ".git" "node_modules"
```

Verify uploaded files were included:

```powershell
Get-ChildItem `
  "$HOME\Desktop\Disciplinary-System-Transfer\Disciplinary-System\backend\uploads" `
  -Recurse -File |
  Measure-Object
```

If transferring through GitHub, copy `backend/uploads` separately. The
repository `.gitignore` excludes this directory.

### 6. Back Up the Environment Configuration

Copy the local environment file into the private transfer folder:

```powershell
Copy-Item `
  "C:\Users\jeff\Desktop\Projects\Disciplinary-System\backend\.env" `
  "$HOME\Desktop\Disciplinary-System-Transfer\backend.env.backup"
```

This file can contain database and SMS credentials. Never commit it to GitHub.

### 7. Optional Integrity Checks

Create hashes before moving the package:

```powershell
Get-FileHash `
  "$HOME\Desktop\Disciplinary-System-Transfer\disciplinary_system_backup.sql" `
  -Algorithm SHA256

Get-ChildItem `
  "$HOME\Desktop\Disciplinary-System-Transfer\Disciplinary-System\backend\uploads" `
  -Recurse -File |
  Get-FileHash -Algorithm SHA256 |
  Format-Table Path, Hash -AutoSize
```

### 8. Transfer Safely

Move the transfer folder using an encrypted USB drive, private cloud storage, or
another secure method. This system contains personal and disciplinary data.
Do not upload the backup package to a public GitHub repository.

Keep the old laptop unchanged until the new laptop has passed all verification
steps.

## Part B: Install Requirements on the New Laptop

Install:

1. Node.js 20 LTS or newer LTS release
2. MySQL Server 8.x, or XAMPP with MySQL/MariaDB
3. Visual Studio Code
4. VS Code Live Server extension
5. Git, if the project will be cloned or version-controlled

Verify Node:

```powershell
node --version
npm.cmd --version
```

Use `npm.cmd` if PowerShell blocks `npm.ps1` with an execution-policy error.

Verify MySQL using the correct installation path:

```powershell
& "C:\xampp\mysql\bin\mysql.exe" --version
```

or:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --version
```

## Part C: Restore the Existing Application Data

Use this section when transferring the current working application. Do not run
`database/schema.sql` or the migration files after importing the complete dump.
The dump already contains the schema and all current records.

### 1. Copy the Project

Place the project at a convenient location, for example:

```text
C:\Projects\Disciplinary-System
```

Avoid moving only selected folders. Keep `backend`, `frontend`, `database`, and
`docs` together.

### 2. Start MySQL

For XAMPP:

1. Open XAMPP Control Panel.
2. Start MySQL.
3. Confirm the MySQL status is green.

For MySQL Server, confirm the Windows service is running.

### 3. Import the Database Backup

The dump was created using `--databases`, so it creates and selects
`disciplinary_system` automatically.

For XAMPP:

```powershell
& "C:\xampp\mysql\bin\mysql.exe" `
  --user=root `
  --password `
  --default-character-set=utf8mb4 `
  --execute="source C:/Users/YOUR_NAME/Desktop/Disciplinary-System-Transfer/disciplinary_system_backup.sql"
```

For MySQL Server 8:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" `
  --user=root `
  --password `
  --default-character-set=utf8mb4 `
  --execute="source C:/Users/YOUR_NAME/Desktop/Disciplinary-System-Transfer/disciplinary_system_backup.sql"
```

Replace `YOUR_NAME` and the path with the actual backup location. Use forward
slashes inside the `source` path.

If a database with the same name already exists on the new laptop, back it up
before importing. Do not overwrite another installation by accident.

### 4. Verify the Imported Database

Open MySQL:

```powershell
& "C:\xampp\mysql\bin\mysql.exe" --user=root --password
```

Then run:

```sql
USE disciplinary_system;
SHOW TABLES;

SELECT COUNT(*) AS users_count FROM users;
SELECT COUNT(*) AS students_count FROM students;
SELECT COUNT(*) AS parents_count FROM parents;
SELECT COUNT(*) AS student_parent_links_count FROM student_parents;
SELECT COUNT(*) AS cases_count FROM cases;
SELECT COUNT(*) AS case_evidence_count FROM case_evidence;
SELECT COUNT(*) AS hearings_count FROM hearings;
SELECT COUNT(*) AS sanctions_count FROM sanctions;
SELECT COUNT(*) AS appeals_count FROM appeals;
SELECT COUNT(*) AS notifications_count FROM notifications;
SELECT COUNT(*) AS sms_logs_count FROM sms_logs;
SELECT COUNT(*) AS email_logs_count FROM email_logs;
SELECT COUNT(*) AS case_conversations_count FROM case_conversations;
SELECT COUNT(*) AS conversation_participants_count FROM conversation_participants;
SELECT COUNT(*) AS case_messages_count FROM case_messages;
```

Confirm the current migration baseline exists:

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'disciplinary_system';

SHOW COLUMNS FROM users LIKE 'avatar_path';
SHOW COLUMNS FROM cases LIKE 'workflow_status';
SHOW COLUMNS FROM cases LIKE 'next_action';
SHOW COLUMNS FROM cases LIKE 'escalation_level';
SHOW COLUMNS FROM case_evidence LIKE 'evidence_category';
SHOW COLUMNS FROM sanctions LIKE 'completion_evidence_path';
SHOW COLUMNS FROM hearings LIKE 'outcome';
SHOW COLUMNS FROM email_logs LIKE 'email_address';
SHOW COLUMNS FROM case_messages LIKE 'body';

SHOW TABLES LIKE 'case_report_drafts';
SHOW TABLES LIKE 'case_decisions';
SHOW TABLES LIKE 'case_workflow_events';
SHOW TABLES LIKE 'case_conversations';
SHOW TABLES LIKE 'conversation_participants';
SHOW TABLES LIKE 'case_messages';
```

Exit:

```sql
exit
```

Compare these counts with the old laptop if possible.

They should match the saved `database_counts.txt` report.

### 5. Restore Uploaded Files

Confirm these folders exist in the new project:

```text
backend/uploads/avatars
backend/uploads/evidence
```

Compare file counts:

```powershell
Get-ChildItem "C:\Projects\Disciplinary-System\backend\uploads\avatars" -File |
  Measure-Object

Get-ChildItem "C:\Projects\Disciplinary-System\backend\uploads\evidence" -File |
  Measure-Object
```

The database stores paths to these files. Renaming files inside these folders
will break profile photos or evidence links.

Browser login sessions do not need to be transferred. All users can log in
again after the database is restored.

### 6. Restore `backend/.env`

Copy the private backup:

```powershell
Copy-Item `
  "$HOME\Desktop\Disciplinary-System-Transfer\backend.env.backup" `
  "C:\Projects\Disciplinary-System\backend\.env"
```

Review the file and adjust the database password if the new laptop uses a
different MySQL password:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=disciplinary_system
JWT_SECRET=keep_the_existing_secret_or_set_a_new_long_random_value
JWT_EXPIRES_IN=1d
PORT=5000

SMS_ENABLED=false
SMS_PROVIDER=semaphore
SMS_API_KEY=
SMS_SENDER_NAME=PTI

EMAIL_ENABLED=false
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=Philtech-GMA
SMTP_FROM_EMAIL=
```

If `JWT_SECRET` is changed, existing browser login tokens become invalid, but no
database data is lost. Users simply need to log in again.

### 7. Install Backend Dependencies

Open PowerShell:

```powershell
Set-Location "C:\Projects\Disciplinary-System\backend"
npm.cmd ci
```

Do not copy `backend/node_modules` between laptops as the primary installation
method. Reinstalling from `package-lock.json` avoids platform-specific problems.

If `npm.cmd ci` reports that `package.json` and `package-lock.json` are out of
sync, run:

```powershell
npm.cmd install
```

## Part D: Run the Application

The application needs three running parts:

1. MySQL
2. Node backend on port `5000`
3. Static frontend server on port `5500`

### Terminal 1: Start the Backend

```powershell
Set-Location "C:\Projects\Disciplinary-System\backend"
npm.cmd run dev
```

For a non-development run:

```powershell
npm.cmd start
```

Expected output:

```text
Server running on http://localhost:5000
```

Test the API:

```powershell
Invoke-RestMethod http://localhost:5000/
```

Expected message:

```text
Disciplinary System API is running
```

### Terminal 2: Start the Frontend

Recommended VS Code method:

1. Open `C:\Projects\Disciplinary-System` in VS Code.
2. Install the Live Server extension.
3. Right-click `frontend/pages/auth/login.html`.
4. Select **Open with Live Server**.
5. Confirm the address uses port `5500`.

Expected login URL:

```text
http://127.0.0.1:5500/frontend/pages/auth/login.html
```

Command-line alternative:

```powershell
Set-Location "C:\Projects\Disciplinary-System"
npx.cmd --yes serve . --listen 5500
```

Then open:

```text
http://localhost:5500/frontend/pages/auth/login.html
```

Do not double-click the HTML file and run it as `file:///...`. Use an HTTP
server so fetch requests and navigation behave consistently.

## Part E: Verification Checklist

Do not delete the old laptop copy until all checks pass.

### Data Checks

- Existing users can log in.
- Student names and student numbers are present.
- Existing cases and case numbers are present.
- Case statuses match the old laptop.
- Hearing schedules and overdue statuses match.
- Sanctions, appeals, notifications, and counselor notes are present.
- Parent and student links still work.

### File Checks

- Profile photos display.
- Student profile photos display.
- Existing evidence links open.
- A new avatar can be uploaded and reopened.
- A new evidence file can be uploaded and reopened.

### Role Checks

Test at least one account for:

- Admin
- Discipline officer
- Teacher
- Guidance counselor
- Student
- Parent

### Workflow Check

Run one test from teacher report to case completion:

1. Teacher reports an incident.
2. Admin or discipline officer reviews it.
3. Discipline officer claims or assigns it.
4. Schedule or reschedule a hearing.
5. Confirm student and parent notifications.
6. Record hearing result.
7. Apply or complete sanctions if required.
8. Resolve or dismiss the case.
9. Confirm the final status appears consistently for every role.

## Part F: Creating a New Empty Installation

Use this only when no existing records need to be preserved.

1. Create an empty `disciplinary_system` database.
2. Run the current `database/schema.sql` once.
3. Create users and records through the Admin interfaces or imports.

Example:

```powershell
& "C:\xampp\mysql\bin\mysql.exe" --user=root --password `
  --execute="CREATE DATABASE disciplinary_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

& "C:\xampp\mysql\bin\mysql.exe" --user=root --password `
  --default-character-set=utf8mb4 `
  --execute="source C:/Projects/Disciplinary-System/database/schema.sql"
```

The current `schema.sql` is consolidated and already contains the changes from
migrations `001` through `008`.

Do not run all migrations after the consolidated schema on a new database.
Doing so can cause duplicate-column or duplicate-table errors.

The migration files are for upgrading older databases that existed before those
features were added.

## Part G: Regular Backups

Create a backup before:

- moving to another laptop
- applying database migrations
- bulk imports or deletes
- major workflow changes
- deployment

### Database Backup

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "D:\Disciplinary-System-Backups\$stamp"
New-Item -ItemType Directory -Force $backupDir

& "C:\xampp\mysql\bin\mysqldump.exe" `
  --user=root `
  --password `
  --databases disciplinary_system `
  --single-transaction `
  --routines `
  --triggers `
  --events `
  --default-character-set=utf8mb4 `
  --result-file="$backupDir\disciplinary_system.sql"
```

### Upload Backup

```powershell
Copy-Item `
  "C:\Projects\Disciplinary-System\backend\uploads" `
  "$backupDir\uploads" `
  -Recurse
```

### Environment Backup

```powershell
Copy-Item `
  "C:\Projects\Disciplinary-System\backend\.env" `
  "$backupDir\backend.env.backup"
```

Store backups on a different physical drive or secure private storage. A backup
on the same laptop does not protect against drive failure.

## Part H: Troubleshooting

### `npm.ps1 cannot be loaded`

Use:

```powershell
npm.cmd install
npm.cmd run dev
```

This avoids changing the system execution policy.

### `mysql` or `mysqldump` is not recognized

Use the executable's full path, such as:

```text
C:\xampp\mysql\bin\mysql.exe
C:\xampp\mysql\bin\mysqldump.exe
```

### `ECONNREFUSED 127.0.0.1:3306`

- Start MySQL.
- Check `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- Confirm MySQL is listening on port `3306`.

### Backend starts but login fails

- Confirm the database import completed.
- Confirm `users` contains records.
- Confirm the backend terminal has no SQL errors.
- Confirm the frontend is using `http://localhost:5000/api`.

### Profile images or evidence are missing

- Confirm `backend/uploads` was copied.
- Confirm file names were not changed.
- Confirm the database was restored from the matching backup.
- Open `http://localhost:5000/uploads/...` for one stored path.

### Port `5000` is already in use

Stop the existing process or change `PORT` in `.env`. The current frontend is
configured for backend port `5000`, so changing it also requires updating:

```text
frontend/js/core/api.js
frontend/js/core/auth.js
```

### Live Server uses a different port

Set Live Server to port `5500`, or use the URL it opens. The backend can remain
on port `5000`.

## Security Notes

- Never commit `backend/.env`.
- Never commit database dumps containing real data.
- Never place uploaded disciplinary records in a public repository.
- Encrypt transfer drives where possible.
- Delete temporary transfer copies after verification.
- Keep at least two tested backups before deployment.
