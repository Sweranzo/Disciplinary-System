# Philtech-GMA Disciplinary System

Web-based disciplinary case management for administrators, discipline officers,
teachers, guidance counselors, students, and parents.

## Local Development

The application uses:

- static HTML, CSS, and JavaScript frontend
- Node.js and Express backend
- MySQL database
- local upload storage under `backend/uploads`

Quick start:

1. Start MySQL.
2. Configure `backend/.env`.
3. Run `npm.cmd install` in `backend`.
4. Run `npm.cmd run dev` in `backend`.
5. Serve the repository with VS Code Live Server on port `5500`.
6. Open `http://127.0.0.1:5500/frontend/pages/auth/login.html`.

## Complete Setup and Transfer Instructions

See [docs/SETUP_STEPS.md](docs/SETUP_STEPS.md) for:

- first-time installation
- moving the system to another laptop
- exporting and restoring the database
- preserving avatars and evidence files
- environment configuration
- startup and verification procedures
- regular backup and recovery steps

For a laptop move, give the new Codex session the whole private transfer
package and tell it to start with the **Codex Laptop Restore Brief** in
[docs/SETUP_STEPS.md](docs/SETUP_STEPS.md). Codex must restore the MySQL dump,
`backend/uploads`, and `backend/.env` before verifying the app. It must not run
`database/schema.sql` or migrations over an existing dump, because that can
overwrite or conflict with real records.

Use this rule when deciding how to prepare a database:

- Existing real data: restore `disciplinary_system_backup.sql` only.
- New empty install: run `database/schema.sql` once.
- Older existing install: back it up, then run only the missing numbered
  migrations in order.

For database changes and future migrations, start with
[docs/DB_CHANGES.md](docs/DB_CHANGES.md). Any change that affects schema,
seed data, uploads, environment setup, backup, restore, or startup must update
the migration notes so Codex can reopen the app on another laptop without
losing records.

The current consolidated schema includes migrations `001` through `008`. A
restored or upgraded database should include 30 tables, including
`case_evidence`, `email_logs`, `case_conversations`,
`conversation_participants`, and `case_messages`.

## Important Data Locations

```text
MySQL database: disciplinary_system
Profile photos: backend/uploads/avatars
Evidence files: backend/uploads/evidence
Private settings: backend/.env
OCR language data: backend/eng.traineddata
```

The database, uploaded files, and private settings must be handled correctly
when transferring or backing up the system. The OCR language data file is part
of the project files and should remain in `backend`.

Do not publish `.env`, database backups, or uploaded disciplinary records.
