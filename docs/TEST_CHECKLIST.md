# Test Checklist

## Authentication
- Login succeeds for each role:
  - admin
  - discipline_officer
  - teacher
  - guidance_counselor
  - student
  - parent
- Invalid login is rejected

## Authorization
- Teacher cannot see unrelated cases in `/api/cases/all`
- Teacher can open only self-reported or assigned case details
- Student can access only own cases, hearings, sanctions, appeals, and profile
- Parent can access only linked-student cases, hearings, sanctions, and dashboard overview
- Counselor can access counselor workspace endpoints only
- Admin and discipline officer can review appeals and evidence

## Case Management
- Teacher can create a case
- Admin and discipline officer can list cases with filters
- Admin and discipline officer can assign a case
- Admin and discipline officer can update case status
- Counselor can open counselor-visible cases
- Timeline updates save and reload correctly

## Student Records
- Admin student list loads with search/pagination
- Admin student list shows QR previews
- Admin can create a profile-only student
- Admin can create a student with a linked login account
- Admin can create a linked parent during the add-student flow
- Admin can link an existing parent during the add-student flow
- Admin can create a linked account later for a profile-only student
- Admin can open student profile
- Admin can update student academic fields and status
- Admin can update student identity fields and see QR details on the profile page
- Student self-profile loads correctly
- Counselor student profile loads correctly

## Admin Identity
- Admin account list loads with role and status filters
- Admin can create accounts for:
  - admin
  - discipline_officer
  - guidance_counselor
  - teacher
  - student
  - parent
- Admin can edit existing accounts
- Admin can activate and deactivate accounts
- Admin can reset passwords and receive the temporary password response
- Admin can create parent records without accounts
- Admin can create parent records with linked accounts
- Admin can link one parent to multiple students
- Admin can link multiple parents to one student

## Bulk Import
- Student CSV preview loads before import
- Student bulk import creates profile-only students when login creation is off
- Student bulk import creates student accounts when login creation is on
- Staff CSV import creates teacher, discipline officer, and guidance counselor accounts
- Parent CSV import creates parent records
- Import summary reports created rows, skipped rows, and validation errors

## Evidence
- Teacher can upload evidence to a relevant case
- Discipline officer can upload evidence
- Evidence appears in case detail
- Admin/discipline officer can approve/reject evidence
- Uploaded file link opens through backend `/uploads/...`

## Hearings
- Discipline officer can schedule hearing from case detail
- Admin/discipline pages can list hearings
- Hearing update endpoint works
- Student and parent hearing pages reflect scheduled hearings

## Sanctions
- Discipline officer can assign sanction from case detail
- Admin/discipline sanction pages list sanctions
- Sanction update endpoint works
- Student and parent sanction pages show status and schedule

## Appeals
- Student can submit appeal for own case
- Duplicate active appeal submission is blocked
- Admin can review appeal
- Discipline officer can review appeal
- Appeal status and notes appear on student side

## Counselor Workspace
- Counselor dashboard loads summary cards
- Counselor case queue loads
- Counselor can save intervention / behavior / recommendation note
- Counselor notes appear in counselor case detail
- Counselor can open linked student history

## Parent Experience
- Parent dashboard shows linked student overview
- Parent case page shows linked cases only
- Parent hearings and sanctions show linked records only

## SMS Notifications
- Teacher case creation triggers linked parent notification handling
- If SMS is enabled and parent phone numbers exist, `sms_logs` records are created with `sent`
- If SMS is disabled, teacher still sees the in-app parent notification summary after case submission
- Parent-linked cases set `parent_notified = 1` when parent notification handling succeeds
- Missing parent phone numbers create `sms_logs` failure records instead of crashing case creation

## Regression Checks
- Existing login flow still redirects by role
- Existing student and parent notifications pages still load
- Existing teacher report case page still works
