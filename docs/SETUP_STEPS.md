# Setup Steps

## 1. Backend Dependencies
From:
- [backend](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\backend)

Run:
```powershell
npm install
```

Important:
- this install now needs `multer` for multipart evidence upload handling
- this install now also needs `qrcode` for local QR code generation

## 2. Configure Environment
Make sure [backend/.env](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\backend\.env) contains the correct values:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `SMS_ENABLED`
- `SMS_PROVIDER`
- `SMS_API_KEY`
- `SMS_SENDER_NAME`

## 3. Prepare Database
Create the base database using:
- [schema.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\schema.sql)

Then apply the core module migration:
- [001_core_modules.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\001_core_modules.sql)

Then apply the admin identity migration:
- [002_identity_management.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\002_identity_management.sql)

Then apply the profile settings migration:
- [003_profile_settings.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\003_profile_settings.sql)

See:
- [DB_CHANGES.md](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\docs\DB_CHANGES.md)

## 4. Add Seed Data
The project still needs realistic users/students/parents/cases in the database. At minimum, create:

- 1 admin user
- 1 discipline officer user
- 1 guidance counselor user
- 1 teacher user
- 1 student user with linked `students` row
- 1 parent user with linked `parents` row
- 1 `student_parents` link

Optional but useful:
- sample case
- sample hearing
- sample sanction
- sample appeal

## 5. Start Backend
From [backend](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\backend):
```powershell
npm run dev
```

The API should start on:
- `http://localhost:5000`

## 6. Open Frontend Pages
Open the static frontend pages from:
- [frontend/pages/auth/login.html](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\frontend\pages\auth\login.html)

After login, the existing role redirect will route users to the correct dashboard.

## 7. Evidence Upload Notes
- evidence uploads are stored under `backend/uploads/evidence`
- uploaded files are served by the backend under `/uploads/...`
- the upload endpoint expects `multipart/form-data`
- the migration must be applied before evidence review metadata will work
- confirm the `backend/uploads/evidence` folder exists and is writable by the backend process
- if you move the backend to another host or port, update frontend links that currently target `http://localhost:5000/uploads/...`

## 8. Admin Identity Module Notes
- the new admin identity workspace is at:
  - [accounts.html](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\frontend\pages\admin\accounts.html)
- the upgraded student management workspace is at:
  - [students.html](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\frontend\pages\admin\students.html)
- QR codes are generated dynamically from `students.qr_token`
- student and parent profiles can now exist without login accounts
- login accounts can be created later and linked from the admin UI

## 9. Shared Profile Settings
- every signed-in role can now open:
  - [profile-settings.html](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\frontend\pages\common\profile-settings.html)
- profile photos are uploaded to:
  - `backend/uploads/avatars`
- uploaded avatar files are served by the backend under:
  - `/uploads/avatars/...`
- if avatar upload is used, confirm the `backend/uploads/avatars` folder exists and is writable
- the top-right profile menu uses `/api/auth/me` to refresh the signed-in account display

## 10. Bulk Import CSV Formats

### Students
Header example:
```csv
studentNumber,firstName,middleName,lastName,email,academicLevel,department,program,yearLevel,section,username,password,status
2026-0001,Juan,,Dela Cruz,juan@example.com,college,CCS,BSCS,3rd,CS-3A,juan.delacruz,Temp1234,active
```

Notes:
- if `Create login accounts during import` is checked, `username`, `email`, and `password` should be provided
- if login creation is not checked, the profile is created without a linked account
- QR is generated automatically for each created student

### Teachers / Discipline Officers / Guidance Counselors
Header example:
```csv
employeeOrStudentId,firstName,middleName,lastName,email,username,password,status
EMP-1001,Maria,,Garcia,maria.garcia@example.com,maria.garcia,Temp1234,active
```

### Parents
Header example:
```csv
firstName,middleName,lastName,email,phoneNumber,address,username,password,status
Ana,,Reyes,ana.reyes@example.com,09171234567,Sample Address,ana.reyes,Temp1234,active
```

Notes:
- parent import supports profile creation
- if `Create login accounts during import` is checked, the import also creates and links parent accounts

## 11. SMS Setup
- the project now supports immediate parent SMS when a teacher reports a case
- current provider wiring uses `Semaphore`
- add these values to [backend/.env](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\backend\.env):

```env
SMS_ENABLED=true
SMS_PROVIDER=semaphore
SMS_API_KEY=your_semaphore_api_key
SMS_SENDER_NAME=PTI
```

Notes:
- if `SMS_ENABLED` is not `true`, the system still creates in-app parent notifications but SMS delivery is skipped
- every SMS attempt is logged in `sms_logs`
- parent phone numbers must exist on the linked parent records for SMS to be delivered
