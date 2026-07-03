# Database Schema and Migration Notes

## Current Database

The application uses the MySQL database:

```text
disciplinary_system
```

The current consolidated schema is:

```text
database/schema.sql
```

It contains the current table definitions and the features introduced by
migrations `001` through `008`.

The current restored/upgraded database baseline should have 30 tables. Key
tables from the migration history include:

```text
student_parents
case_evidence
case_report_drafts
case_workflow_events
email_logs
case_conversations
conversation_participants
case_messages
```

## Most Important Rule

Choose only one database setup path.

## Codex Handoff Rule

Whenever a change affects the database schema, seed data, required uploads,
environment variables, backup steps, restore steps, or startup procedure, update
this file in the same change.

Also update these files when the change affects transfer or laptop setup:

- [SETUP_STEPS.md](SETUP_STEPS.md)
- [TRANSFER_CHECKLIST.md](TRANSFER_CHECKLIST.md)

Each new migration must be recorded under `Migration History` with:

- the migration filename
- what tables, columns, indexes, or constraints changed
- whether existing data is modified
- backup or restore notes needed before running it
- verification queries for Codex to run after import or upgrade

UI-only changes do not need a database migration. If a UI change depends on
existing data, note that dependency here only when setup or restore behavior
changes.

### Restore an existing installation

Import the complete `mysqldump` backup.

Do not run `schema.sql` or migrations afterward. The dump already contains the
database structure and records.

This is the correct path when moving the current working laptop data to another
device.

### Create a new empty installation

Create the database and run `database/schema.sql` once.

Do not run migrations `001` through `008` afterward because the consolidated
schema already includes them.

### Upgrade an older installation

Back up the database first, identify the last migration previously applied, and
run only the newer migration files in numeric order.

Do not run `database/schema.sql` against an older database with real records.
That file is for brand-new empty installs only.

## Migration History

### `001_core_modules.sql`

Adds or extends:

- evidence review metadata
- appeal decision metadata
- `counselor_interventions`
- indexes for case, hearing, sanction, appeal, evidence, and counselor queries

### `002_identity_management.sql`

Adds:

- profile-only student and parent records
- nullable student and parent account links
- student and parent identity fields
- record statuses
- safer `ON DELETE SET NULL` account behavior
- duplicate parent/student link prevention

### `003_profile_settings.sql`

Adds:

- `users.avatar_path`

Profile image files are stored under:

```text
backend/uploads/avatars
```

### `004_sms_notifications.sql`

Adds or extends:

- SMS notification records
- provider and delivery metadata
- parent notification tracking

### `005_case_workflow.sql`

Adds:

- review and workflow statuses
- next-action tracking
- acknowledgements
- workflow event history
- additional hearing outcome fields
- notification metadata

### `006_formal_case_process.sql`

Adds:

- report drafts
- witnesses and statements
- policy rules and case policy references
- structured case decisions and approvals
- hearing attendees
- SLA rules and escalation fields
- case packet exports
- expanded evidence and appeal lifecycle fields

### `007_student_email_notifications.sql`

Adds:

- student email delivery logs
- explicit `missed` hearing status
- indexes for email audit review by case, student, and creation time

### `008_case_messaging.sql`

Adds:

- case-linked conversations
- conversation participants with read tracking
- message records for secure role-aware case threads

## Safe Migration Procedure

Before applying any migration:

1. Stop application writes.
2. Export the complete database.
3. Copy `backend/uploads`.
4. Confirm the backup files are readable.
5. Record row counts for all operational tables.
6. Apply only the required migration.
7. Restart the backend.
8. Run the verification queries and regression checklist.

Never use `DROP DATABASE`, `DROP TABLE`, destructive `ALTER TABLE`, or a fresh
`schema.sql` import on a database with real records unless a verified backup
exists and the user explicitly confirms the target data is disposable.

Full backup and restore commands are documented in:

- [SETUP_STEPS.md](SETUP_STEPS.md)
- [TRANSFER_CHECKLIST.md](TRANSFER_CHECKLIST.md)

## Verification Queries

After restoring or upgrading:

```sql
USE disciplinary_system;
SHOW TABLES;

SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM students;
SELECT COUNT(*) FROM parents;
SELECT COUNT(*) FROM student_parents;
SELECT COUNT(*) FROM cases;
SELECT COUNT(*) FROM case_evidence;
SELECT COUNT(*) FROM hearings;
SELECT COUNT(*) FROM sanctions;
SELECT COUNT(*) FROM appeals;
SELECT COUNT(*) FROM notifications;
SELECT COUNT(*) FROM sms_logs;
SELECT COUNT(*) FROM email_logs;
SELECT COUNT(*) FROM case_conversations;
SELECT COUNT(*) FROM conversation_participants;
SELECT COUNT(*) FROM case_messages;
```

Confirm these important objects exist:

```sql
SHOW COLUMNS FROM users LIKE 'avatar_path';
SHOW COLUMNS FROM cases LIKE 'workflow_status';
SHOW COLUMNS FROM cases LIKE 'next_action';
SHOW COLUMNS FROM cases LIKE 'escalation_level';
SHOW COLUMNS FROM case_evidence LIKE 'evidence_category';
SHOW COLUMNS FROM sanctions LIKE 'completion_evidence_path';
SHOW COLUMNS FROM hearings LIKE 'outcome';
SHOW COLUMNS FROM email_logs LIKE 'email_address';
SHOW COLUMNS FROM case_messages LIKE 'body';
SHOW TABLES LIKE 'counselor_interventions';
SHOW TABLES LIKE 'case_workflow_events';
SHOW TABLES LIKE 'case_report_drafts';
SHOW TABLES LIKE 'case_decisions';
SHOW TABLES LIKE 'sms_logs';
SHOW TABLES LIKE 'email_logs';
SHOW TABLES LIKE 'case_conversations';
SHOW TABLES LIKE 'conversation_participants';
SHOW TABLES LIKE 'case_messages';
```

Optional table-count check:

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'disciplinary_system';
```
