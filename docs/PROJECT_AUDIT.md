# Project Audit

## Scope
This repository is an early-stage disciplinary system prototype. It already supports a narrow operational path, but most advanced features are still missing, schema-only, or placeholder UI.

Status labels:

- Fully implemented: backend route/controller plus working consumer exists
- Partially implemented: usable pieces exist, but the workflow is incomplete
- Schema-only: table exists, but no usable application layer
- Missing: no meaningful implementation found

## Repository Structure

### Backend
- `backend/server.js`
- `backend/config/db.js`
- `backend/controllers/authController.js`
- `backend/controllers/caseController.js`
- `backend/controllers/hearingController.js`
- `backend/controllers/hearingViewController.js`
- `backend/controllers/sanctionController.js`
- `backend/controllers/studentController.js`
- `backend/middleware/authMiddleware.js`
- `backend/middleware/roleMiddleware.js`
- `backend/routes/authRoutes.js`
- `backend/routes/caseRoutes.js`
- `backend/routes/hearingRoutes.js`
- `backend/routes/hearingViewRoutes.js`
- `backend/routes/sanctionRoutes.js`
- `backend/routes/studentRoutes.js`
- `backend/routes/testRoutes.js`
- `backend/utils/auditLogger.js`

### Frontend
- Shared:
  - `frontend/css/styles.css`
  - `frontend/js/core/api.js`
  - `frontend/js/core/auth.js`
- Pages:
  - `frontend/pages/auth/login.html`
  - `frontend/pages/admin/*.html`
  - `frontend/pages/discipline/*.html`
  - `frontend/pages/teacher/*.html`
  - `frontend/pages/student/*.html`
  - `frontend/pages/parent/*.html`
  - `frontend/pages/counselor/dashboard.html`

### Database
- `database/schema.sql`

## Structure Observations
- `docs/` did not exist before this audit.
- `database/seed.sql` is referenced by `readme.md` but is missing.
- `backend/services/`, `backend/uploads/`, `frontend/assets/`, and role-specific JS folders are referenced by `readme.md` but do not exist.
- There is no visible automated test suite.
- The folder is not a git repository in its current location.

## Architecture Summary

### Backend
- Express API with simple route mounting in `backend/server.js`
- MySQL access through `mysql2/promise`
- JWT auth via `backend/middleware/authMiddleware.js`
- Simple role gating via `backend/middleware/roleMiddleware.js`
- Controllers directly run SQL; there is no service layer
- Audit writes exist through `backend/utils/auditLogger.js`

### Frontend
- Static HTML pages with inline scripts
- Shared fetch helper in `frontend/js/core/api.js`
- Shared auth/localStorage helper in `frontend/js/core/auth.js`
- No SPA router, shared components, or dedicated feature JS modules

### Database
- Schema is ahead of implementation
- Core tables exist for users, students, parents, cases, case updates, evidence, hearings, sanctions, appeals, notifications, SMS logs, and audit logs

## What Is Already Implemented

### Fully Implemented

#### Authentication
- Files involved:
  - `backend/controllers/authController.js`
  - `backend/routes/authRoutes.js`
  - `backend/middleware/authMiddleware.js`
  - `frontend/pages/auth/login.html`
  - `frontend/js/core/api.js`
  - `frontend/js/core/auth.js`
- Current behavior:
  - Login by username or email
  - JWT issuance
  - Current user fetch
  - Notifications fetch
  - Role-based redirect after login

#### Basic Case Reporting
- Files involved:
  - `backend/controllers/caseController.js`
  - `backend/routes/caseRoutes.js`
  - `frontend/pages/teacher/report-case.html`
- Current behavior:
  - Teacher, admin, and discipline officer can create a case
  - Student is resolved by student number
  - Notification is created for the student

#### Student and Parent Visibility
- Files involved:
  - `backend/controllers/caseController.js`
  - `frontend/pages/student/cases.html`
  - `frontend/pages/parent/cases.html`
  - `frontend/pages/student/notifications.html`
  - `frontend/pages/parent/notifications.html`
- Current behavior:
  - Student can view own cases
  - Parent can view linked child cases
  - Student and parent can view notifications

#### Hearing Scheduling and Viewing
- Files involved:
  - `backend/controllers/hearingController.js`
  - `backend/controllers/hearingViewController.js`
  - `backend/routes/hearingRoutes.js`
  - `backend/routes/hearingViewRoutes.js`
  - `frontend/pages/discipline/case-details.html`
  - `frontend/pages/student/hearings.html`
  - `frontend/pages/parent/hearings.html`
- Current behavior:
  - Admin and discipline officer can schedule hearings
  - Case status updates to `hearing_scheduled`
  - Student and parent notifications are created
  - Student and parent can view hearings

#### Basic Sanction Assignment and Viewing
- Files involved:
  - `backend/controllers/sanctionController.js`
  - `backend/routes/sanctionRoutes.js`
  - `frontend/pages/discipline/case-details.html`
  - `frontend/pages/student/sanctions.html`
  - `frontend/pages/parent/sanctions.html`
- Current behavior:
  - Admin and discipline officer can assign sanctions
  - Student and parent can view sanctions

#### Student Listing
- Files involved:
  - `backend/controllers/studentController.js`
  - `backend/routes/studentRoutes.js`
  - `frontend/pages/admin/students.html`
- Current behavior:
  - Admin can fetch and list students

### Partially Implemented

#### Case Management
- Files involved:
  - `backend/controllers/caseController.js`
  - `backend/routes/caseRoutes.js`
  - `frontend/pages/admin/cases.html`
  - `frontend/pages/discipline/cases.html`
  - `frontend/pages/discipline/case-details.html`
  - `frontend/pages/teacher/cases.html`
  - `frontend/pages/teacher/case-details.html`
- Existing behavior:
  - Case list pages
  - Case detail fetch
  - Case updates
  - Case status update
- Why partial:
  - No assignment workflow
  - No search, filters, pagination, bulk actions, or confidential notes
  - No true admin/counselor management center

#### Admin Dashboard
- Files involved:
  - `frontend/pages/admin/dashboard.html`
- Existing behavior:
  - Dashboard page loads and shows user info
- Why partial:
  - Stats are hard-coded
  - Report and sanction buttons are placeholders

#### Counselor Workspace
- Files involved:
  - `frontend/pages/counselor/dashboard.html`
- Existing behavior:
  - Counselor can log in and land on a dashboard
- Why partial:
  - No data integration or operational tools

#### Audit Logging
- Files involved:
  - `backend/utils/auditLogger.js`
  - `database/schema.sql`
- Existing behavior:
  - Writes audit records for selected actions
- Why partial:
  - No audit log viewer
  - Many important actions are still not logged

### Schema-Only

#### Evidence
- Files involved:
  - `database/schema.sql`
- Existing state:
  - `case_evidence` table exists
- Missing:
  - upload handling
  - evidence routes
  - evidence review UI

#### Appeals
- Files involved:
  - `database/schema.sql`
  - `frontend/pages/student/dashboard.html`
- Existing state:
  - `appeals` table exists
  - student dashboard mentions appeal submission
- Missing:
  - routes, controller, pages, board workflow

#### QR Identification
- Files involved:
  - `database/schema.sql`
  - `frontend/pages/student/dashboard.html`
  - `frontend/pages/teacher/dashboard.html`
- Existing state:
  - `students.qr_token` exists
  - UI mentions QR features
- Missing:
  - generation, validation, display, scanner flow

#### SMS Support
- Files involved:
  - `database/schema.sql`
- Existing state:
  - `sms_logs` table exists
- Missing:
  - provider integration
  - send/retry logic
  - admin UI

### Missing
- student profile pages and APIs
- evidence management center
- hearing calendar for staff
- appeals board
- sanctions monitoring center
- student records CRUD
- system settings
- user profile management
- analytics/reporting dashboard
- reporting/export tools
- user management
- parent management tools
- audit log viewer

## Missing Routes, Controllers, and Pages

### Backend Routes/Controllers Missing
- appeal submission, list, review, decision
- evidence upload, list, review, delete
- staff hearing list, update, cancel, complete
- sanction tracking update and completion verification
- student profile detail and update
- user CRUD and password reset/admin reset
- parent CRUD and parent-student linking management
- audit log list/filter/export
- analytics and export endpoints
- settings endpoints
- QR generate/validate endpoints
- SMS trigger/log management endpoints

### Frontend Pages Missing
- admin student detail/profile page
- student self-profile page
- evidence center page
- evidence section on case detail
- appeals submission page
- appeals board workspace
- hearing calendar page for staff
- sanction monitoring page for staff
- user management page
- parent management page
- audit log viewer page
- settings page
- analytics/reports page
- QR display/scan pages

## Database Changes Needed

### Strongly Recommended
- `case_evidence`:
  - add `original_name`, `mime_type`, `file_size`, `review_status`, `reviewed_by_user_id`, `reviewed_at`, `review_notes`
- `appeals`:
  - add `reviewed_by_user_id`, `reviewed_at`, `decision_notes`, `board_resolution`
- `sanctions`:
  - make actual use of `start_date`, `end_date`, `status`
  - add `completed_at`, `completion_notes`, `verified_by_user_id`
- `students`:
  - optional personal/contact fields if full profile is required
- settings:
  - add a `system_settings` table
- SMS:
  - add provider message id, retry count, template name

## Role-Based Protection Gaps
- `GET /api/cases/all` allows teachers to see every case, not just their own reports
- `GET /api/cases/:id` allows `student` and `parent`, but the controller does not verify ownership or linked-child relationship
- No field-level separation for private counselor or internal discipline notes
- Frontend role gating is localStorage-based and only protects navigation, not static file exposure

## UI and UX Weaknesses
- Styling is inconsistent; some pages use classes not defined in `frontend/css/styles.css`
- Several dashboards contain placeholder list items with no links
- Critical records are shown as raw JSON in `<pre>` blocks
- Hard-coded credentials appear in the login page
- No search, filtering, pagination, empty states, or structured validation
- No polished admin/case workflow screens yet

## Recommended Implementation Order

### 1. Stabilize Core Security
- Fix ownership checks
- Restrict teacher case scope
- Add list filtering and pagination patterns

### 2. Complete Core Operations
- Build proper case management center
- Build staff hearing management
- Build sanction monitoring
- Build full student profile/detail flow

### 3. Add Investigation Features
- Evidence upload, review, and evidence center

### 4. Add Resolution and Support Workflows
- Appeals board
- Counselor workspace
- Parent management
- User management
- Audit log viewer

### 5. Add Platform-Level Features
- Settings
- Analytics and reporting
- Export tools
- QR identification
- SMS integration

## Bottom Line
The strongest real workflow today is:

- login
- teacher case reporting
- discipline case review and updates
- hearing scheduling
- sanction assignment
- student and parent visibility

Everything beyond that is either partial, schema-only, or missing. The next implementation wave should prioritize security and operational completeness before adding advanced features like QR, SMS, analytics, and appeals.
