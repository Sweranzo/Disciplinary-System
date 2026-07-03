# Laptop Transfer Checklist

Use this short checklist together with
[SETUP_STEPS.md](SETUP_STEPS.md).

## Codex Handoff

Give Codex the full private transfer package and tell it:

```text
Read docs/SETUP_STEPS.md first. Restore the existing MySQL dump, uploads, and
backend/.env before running the app. Do not run database/schema.sql or database
migrations on top of the restored dump. Verify database counts, profile photos,
evidence files, and role logins before deleting anything from the old laptop.
```

Database decision rule:

- Existing real data: import `disciplinary_system_backup.sql` only.
- Brand-new empty install: run `database/schema.sql` once.
- Older existing install: back up first, then run only missing migrations.

The transfer package should contain:

- [ ] Complete `Disciplinary-System` project folder.
- [ ] `disciplinary_system_backup.sql`.
- [ ] `database_counts.txt`.
- [ ] `backend.env.backup`.
- [ ] `backend/uploads/avatars`.
- [ ] `backend/uploads/evidence`.
- [ ] `backend/eng.traineddata`.
- [ ] `backend/package-lock.json`.

## Old Laptop

- [ ] Stop users from changing records.
- [ ] Stop the backend.
- [ ] Export `disciplinary_system` with `mysqldump`.
- [ ] Confirm the SQL backup is not empty.
- [ ] Save `database_counts.txt` with counts for users, students, parents,
      `student_parents`, cases, `case_evidence`, hearings, sanctions, appeals,
      notifications, `sms_logs`, `email_logs`, `case_conversations`,
      `conversation_participants`, and `case_messages`.
- [ ] Copy the complete project folder.
- [ ] Confirm `backend/uploads/avatars` is included.
- [ ] Confirm `backend/uploads/evidence` is included.
- [ ] Confirm `backend/eng.traineddata` is included.
- [ ] Confirm `backend/package-lock.json` is included.
- [ ] Copy `backend/.env` privately.
- [ ] Record database and upload file counts.
- [ ] Keep the old laptop unchanged.

## New Laptop

- [ ] Install Node.js LTS.
- [ ] Install MySQL or XAMPP.
- [ ] Install VS Code and Live Server.
- [ ] Copy the project to `C:\Projects\Disciplinary-System`.
- [ ] Import the complete SQL backup.
- [ ] Do not run `database/schema.sql` after import.
- [ ] Do not run migrations after import.
- [ ] Restore `backend/uploads`.
- [ ] Restore and review `backend/.env`.
- [ ] Run `npm.cmd ci` in `backend`.
- [ ] If `npm.cmd ci` fails because the lock file is out of sync, run `npm.cmd install`.
- [ ] Start MySQL.
- [ ] Start the backend on port `5000`.
- [ ] Start Live Server on port `5500`.

## Verification

- [ ] API root responds successfully.
- [ ] Database table count is 30.
- [ ] Database record counts match `database_counts.txt`.
- [ ] Current migration objects exist: `users.avatar_path`,
      `cases.workflow_status`, `cases.next_action`,
      `case_evidence.evidence_category`, `email_logs.email_address`, and
      `case_messages.body`.
- [ ] Admin login works.
- [ ] Discipline officer login works.
- [ ] Teacher login works.
- [ ] Counselor login works.
- [ ] Student login works.
- [ ] Parent login works.
- [ ] Existing cases and statuses match.
- [ ] Existing hearings and sanctions match.
- [ ] Profile photos display.
- [ ] Evidence links open.
- [ ] OCR or student import features can find `backend/eng.traineddata`.
- [ ] New avatar upload works.
- [ ] New evidence upload works.
- [ ] Cross-role case workflow works.

## Completion

- [ ] Make a fresh backup from the new laptop.
- [ ] Keep the old backup until the new backup is tested.
- [ ] Remove unencrypted temporary transfer files.
