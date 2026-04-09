# DB Changes

## New SQL File
- [001_core_modules.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\001_core_modules.sql)
- [002_identity_management.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\002_identity_management.sql)
- [003_profile_settings.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\003_profile_settings.sql)

## What This Migration Adds

### `case_evidence`
- `original_name`
- `file_size`
- `review_status`
- `review_notes`
- `reviewed_by_user_id`
- `reviewed_at`

Purpose:
- support evidence upload metadata
- allow discipline/admin review workflow
- record who reviewed evidence and when

### `appeals`
- `decision_notes`
- `reviewed_by_user_id`
- `reviewed_at`

Purpose:
- support appeals board decisions and review history

### New table: `counselor_interventions`
- links counselor notes directly to:
  - case
  - student
  - counselor user
- supports:
  - intervention notes
  - behavior notes
  - recommendations
  - follow-up tracking

### New indexes
- cases by status, student, reporter, assignee
- hearings by case/status/date
- sanctions by student/status
- appeals by case/status
- evidence by case/review status
- counselor interventions by case/status

Purpose:
- improve filtering and dashboard/case-center queries

## Manual Apply Steps

1. Back up the current `disciplinary_system` database.
2. Open MySQL client or phpMyAdmin SQL editor.
3. Run the contents of:
   - [001_core_modules.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\001_core_modules.sql)
4. Confirm the following exist after execution:
   - new columns on `case_evidence`
   - new columns on `appeals`
   - new table `counselor_interventions`
   - the new indexes

## Notes
- The updated backend code expects these schema changes to exist before the new evidence, appeal-review, and counselor note features are used.
- No duplicate core tables were introduced; the migration extends the existing schema instead of replacing it.
- The sanctions monitoring redesign did not require any additional database changes beyond the existing migration above.

## `002_identity_management.sql`

### What This Migration Adds

### `students`
- allows `user_id` to be nullable
- adds:
  - `first_name`
  - `middle_name`
  - `last_name`
  - `email`
  - `record_status`

Purpose:
- support profile-only student records without a login account
- keep student identity data available even when no `users` row exists yet
- support later account linking without losing the profile

### `parents`
- allows `user_id` to be nullable
- adds:
  - `first_name`
  - `middle_name`
  - `last_name`
  - `email`
  - `record_status`

Purpose:
- support parent/guardian records without forcing account creation
- preserve parent identity and contact data outside the `users` table
- allow later parent account creation and linking

### Foreign key behavior updates
- `students.user_id` now uses `ON DELETE SET NULL`
- `parents.user_id` now uses `ON DELETE SET NULL`

Purpose:
- if a linked account is removed later, the student or parent profile can remain in the system

### Link integrity
- adds unique index `idx_student_parent_unique` on `student_parents(student_id, parent_id)`

Purpose:
- prevent duplicate parent-student links

### Additional indexes
- `idx_students_record_status`
- `idx_parents_record_status`

Purpose:
- improve admin filtering for active/inactive profile-only and linked-account records

## Updated Manual Apply Steps

1. Back up the current `disciplinary_system` database.
2. Open MySQL client or phpMyAdmin SQL editor.
3. Run:
   - [001_core_modules.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\001_core_modules.sql)
   - [002_identity_management.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\002_identity_management.sql)
4. Confirm the following after execution:
   - `students.user_id` is nullable
   - `parents.user_id` is nullable
   - `students` contains identity fields and `record_status`
   - `parents` contains identity fields and `record_status`
   - duplicate `student_parents` links are blocked by the unique index

## Admin Identity Notes
- QR generation did not require a new table; the existing `students.qr_token` field is reused.
- QR image rendering is generated dynamically by the backend from the stored token.
- The new admin identity module depends on the migration above before profile-only students and parents will work correctly.

## `003_profile_settings.sql`

### What This Migration Adds

### `users`
- adds:
  - `avatar_path`

Purpose:
- support top-right user profiles for all roles
- allow each account to upload and display a profile photo/avatar
- support the shared profile settings page without changing the existing role structure

## Updated Manual Apply Steps

1. Back up the current `disciplinary_system` database.
2. Open MySQL client or phpMyAdmin SQL editor.
3. Run:
   - [001_core_modules.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\001_core_modules.sql)
   - [002_identity_management.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\002_identity_management.sql)
   - [003_profile_settings.sql](C:\Users\PC user\Documents\Thesis 2026\new disciplinary system project - Copy (2)\database\migrations\003_profile_settings.sql)
4. Confirm the following after execution:
   - `users.avatar_path` exists
   - avatar image uploads can be stored under `backend/uploads/avatars`
   - `/api/auth/me` returns `avatar_url` for accounts with uploaded profile photos
