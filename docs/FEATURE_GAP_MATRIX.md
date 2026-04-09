# Feature Gap Matrix

## Legend
- Fully implemented: backend + usable UI exist
- Partial: some implementation exists, but core workflow gaps remain
- Schema-only: table exists, but no usable application layer exists
- Missing: no meaningful implementation found

| Feature | Status | Existing Files | What Exists | Missing Routes / Controllers / Pages | Database Changes Needed |
|---|---|---|---|---|---|
| Authentication | Fully implemented | `backend/controllers/authController.js`, `backend/routes/authRoutes.js`, `frontend/pages/auth/login.html`, `frontend/js/core/auth.js` | Login, JWT auth, current user, notifications fetch | Registration, password reset, profile edit pages | Optional session/reset tables |
| Student profile | Missing | `backend/controllers/studentController.js`, `frontend/pages/admin/students.html`, `database/schema.sql` | Student list only | Student detail APIs, self-profile APIs, profile pages | Optional personal/contact fields |
| Evidence upload and review | Schema-only | `database/schema.sql` | `case_evidence` table | Upload controller, review controller, upload/review pages | Add evidence metadata and review fields |
| Hearing calendar | Missing | `backend/controllers/hearingController.js`, `backend/controllers/hearingViewController.js` | Hearing create and student/parent tables | Staff hearing list, calendar page, update/cancel/complete APIs | Optional hearing attendees/minutes/reminders |
| Evidence management center | Missing | `database/schema.sql` | None beyond schema | Evidence center page and APIs | Same as evidence feature |
| Appeals board | Schema-only | `database/schema.sql`, `frontend/pages/student/dashboard.html` | Appeal table and UI mention | Appeal routes, submission page, board review page | Add reviewer and decision metadata |
| Sanctions monitoring and tracking | Partial | `backend/controllers/sanctionController.js`, `frontend/pages/discipline/case-details.html`, `frontend/pages/student/sanctions.html`, `frontend/pages/parent/sanctions.html` | Assign sanctions and view them | Tracking page, update APIs, completion verification | Use existing lifecycle fields and add completion metadata |
| Case management center | Partial | `backend/controllers/caseController.js`, `frontend/pages/admin/cases.html`, `frontend/pages/discipline/cases.html`, `frontend/pages/teacher/cases.html`, `frontend/pages/discipline/case-details.html` | Create/list/detail/update/status | Assignment, search, pagination, structured detail views, counselor/admin detail pages | Optional priority/source/closure fields |
| Student records management | Partial | `backend/controllers/studentController.js`, `frontend/pages/admin/students.html` | Read-only student list | CRUD APIs, import/export, student detail/edit pages | Optional archival/import metadata |
| System settings | Missing | none | None | Settings APIs and UI | Add `system_settings` table |
| User profile | Missing | `backend/controllers/authController.js`, `frontend/js/core/auth.js` | Current user fetch only | Profile page, edit profile, change password | Optional profile preference fields |
| Analytics and reporting dashboard | Missing | `frontend/pages/admin/dashboard.html` | Hard-coded dashboard cards | Analytics endpoints, charts, reports page | None for basic aggregates |
| QR identification for student | Schema-only | `database/schema.sql`, `frontend/pages/student/dashboard.html`, `frontend/pages/teacher/dashboard.html` | `qr_token` column and UI mentions | QR generate/validate/display/scan flows | Optional issue/expiry fields |
| SMS support | Schema-only | `database/schema.sql` | `sms_logs` table | SMS service, admin UI, resend/failure APIs | Add provider id/template/retry metadata |
| User management | Missing | `database/schema.sql` | Users table exists | Admin CRUD routes/pages, reset flow | Optional session/reset tables |
| Parent management | Partial | `database/schema.sql`, parent-facing pages | Parent records and links exist in schema; parent portal exists | Parent CRUD, linkage management pages/APIs | Optional verification/contact fields |
| Counselor workspace | Partial | `frontend/pages/counselor/dashboard.html` | Placeholder dashboard | Counselor queue, notes, interventions, student history | Optional intervention/session tables |
| Audit log viewer | Partial | `backend/utils/auditLogger.js`, `database/schema.sql` | Audit writes for selected actions | Audit viewer API/page/export | Current table is enough for v1 |
| Search/filter/pagination | Missing | various list pages | Basic tables only | Query params, UI controls, server-side paging | None |
| Reporting/export tools | Missing | none | None | CSV/PDF/export endpoints and pages | None for basic CSV export |

## Implementation State by Layer

| Area | Backend | Frontend | Database | Overall |
|---|---|---|---|---|
| Auth | Good | Good | Adequate | Fully implemented |
| Case operations | Good for v1 | Moderate | Good | Partial |
| Hearings | Moderate | Minimal for staff, usable for student/parent | Good | Partial |
| Sanctions | Moderate | Minimal | Good | Partial |
| Student records | Minimal | Minimal | Good | Partial |
| Notifications | Moderate | Minimal | Good | Partial |
| Evidence | Missing | Missing | Present | Schema-only |
| Appeals | Missing | Missing | Present | Schema-only |
| QR | Missing | Missing | Present | Schema-only |
| SMS | Missing | Missing | Present | Schema-only |
| Analytics | Missing | Missing | Adequate for aggregates | Missing |

## Role and Protection Gaps

| Area | Current State | Gap |
|---|---|---|
| API auth | JWT middleware exists | No refresh/revocation/session controls |
| Role checks | Basic role middleware exists | No ownership/relationship checks in some controllers |
| Teacher case visibility | Teachers can call `/api/cases/all` | Likely too broad |
| Student case detail | Student role allowed on `/api/cases/:id` | No ownership check in controller |
| Parent case detail | Parent role allowed on `/api/cases/:id` | No linked-child check in controller |
| Private notes | Shared case updates exist | No confidential/internal note model |
| Page protection | localStorage role redirects | Static page access is not centrally controlled |

## Highest Priority Gaps

1. Authorization and data ownership checks
2. Student profile and record detail flow
3. Staff-facing case, hearing, and sanction management centers
4. Evidence upload and review
5. Appeals workflow
6. User, parent, counselor, and audit management
7. Reporting, exports, QR, and SMS
