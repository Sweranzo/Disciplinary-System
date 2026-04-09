# Implementation Phases

## Phase 0: Foundation and Security
Goal: stabilize the prototype before major expansion.

### Objectives
- Fix authorization gaps
- Align project structure and docs with reality
- Add seed/setup support
- Introduce list filtering and pagination conventions

### Recommended Work
- Restrict `GET /api/cases/:id` by ownership for students and parents
- Restrict teacher list access to appropriate case scope
- Add base query parameters to list endpoints:
  - `page`
  - `limit`
  - `search`
  - `status`
  - `severity`
- Add `database/seed.sql`
- Clean up or update `readme.md` to match actual folders

### Files Likely Involved
- `backend/controllers/caseController.js`
- `backend/routes/caseRoutes.js`
- `database/schema.sql`
- `readme.md`

## Phase 1: Core Operations Completion
Goal: make the current system usable for daily disciplinary operations.

### Objectives
- Build a proper case management center
- Improve case detail pages
- Add staff hearing management
- Add sanction monitoring workflow

### Recommended Work
- Build structured case detail UI instead of raw JSON
- Add case assignment to discipline officer and counselor
- Add staff hearing list/calendar with update/cancel/complete actions
- Add sanctions center with status updates and completion tracking
- Add search/filter/pagination across staff lists

### Likely New Pages
- admin case detail page
- discipline hearing center
- sanctions monitoring page

## Phase 2: Student Records and Profiles
Goal: make student data operational and navigable.

### Objectives
- Add full student profile views
- Expand student records management beyond a read-only table
- Surface parent links and case history

### Recommended Work
- Add student detail endpoints for admin/discipline/counselor
- Add self-profile endpoint/page for students
- Add create/edit/archive student flows
- Add parent-link management

### Database Notes
- Existing schema is enough for a basic v1
- Optional additions: contact fields, demographic fields, archive metadata

## Phase 3: Evidence Management
Goal: support actual investigation workflows.

### Objectives
- Add secure evidence upload
- Add review and metadata tracking
- Build centralized evidence management

### Recommended Work
- Add upload middleware and storage strategy
- Add evidence list/upload/delete/review endpoints
- Add evidence panel to case detail pages
- Build evidence center with filters by case, student, uploader, and review status

### Database Changes
- Extend `case_evidence` with:
  - `original_name`
  - `mime_type`
  - `file_size`
  - `review_status`
  - `reviewed_by_user_id`
  - `reviewed_at`
  - `review_notes`

## Phase 4: Appeals and Counselor Workflow
Goal: complete case resolution and support workflows.

### Objectives
- Implement student appeals
- Build appeals board review workflow
- Build real counselor workspace

### Recommended Work
- Add student appeal submission page from case/sanction context
- Add appeals queue and decision workflow for reviewers
- Add counselor case queue, intervention notes, and student history access

### Database Changes
- Extend `appeals` with reviewer and decision metadata
- Consider a counseling/intervention table if that scope is required

## Phase 5: Administration and Governance
Goal: make the platform administrable and auditable.

### Objectives
- User management
- Parent management
- Audit log viewer
- System settings

### Recommended Work
- Add user CRUD, role assignment, and account status controls
- Add parent CRUD and student-parent linking tools
- Add audit log list/filter/export UI and API
- Add settings for sanction types, hearing locations, notification defaults, and school-level configuration

## Phase 6: Reporting, Exports, QR, and SMS
Goal: complete the system with oversight and communication features.

### Objectives
- Analytics dashboard
- Reporting/export tools
- QR identification
- SMS communication

### Recommended Work
- Build aggregate analytics endpoints and admin dashboard cards/charts
- Add CSV/PDF export for cases, hearings, sanctions, students, and audit logs
- Implement student QR generation and teacher validation/scan flow
- Integrate SMS provider and log delivery results

## Recommended Sequence Summary

1. Phase 0: foundation and security
2. Phase 1: core operations completion
3. Phase 2: student records and profiles
4. Phase 3: evidence management
5. Phase 4: appeals and counselor workflow
6. Phase 5: administration and governance
7. Phase 6: reporting, exports, QR, and SMS

## Why This Order
- Security gaps should be fixed before expanding feature breadth
- Case, hearing, sanction, and student record flows are the operational backbone
- Evidence and appeals depend on stable core workflows
- Administrative tooling and analytics become more useful after the underlying workflows are trustworthy
