# Feature Summary

## Security First
- teachers now see only cases they reported or were assigned
- students now access only their own case-linked records
- parents now access only linked-student records
- case detail access is ownership-aware, not just role-aware

## Implemented / Completed in This Pass

### Student Profile
- admin student profile page with editable academic fields and status
- student self-profile page
- counselor student profile page for history review

### Evidence Upload and Review
- backend evidence upload module
- multipart evidence upload via `multer`
- evidence stored under backend uploads
- evidence shown inside case detail timelines
- discipline/admin evidence review workflow with approve/reject notes
- teacher evidence submission for relevant cases

### Case Management Center
- improved admin case center
- improved discipline case center
- improved teacher scoped case center
- structured case detail pages with timeline data
- case assignment to discipline officer or counselor
- case summary endpoint for dashboards

### Sanctions Monitoring and Tracking
- staff sanction monitoring pages for admin and discipline officer
- sanction update endpoint
- sanction start/end date support in UI and backend
- richer student and parent sanction visibility

### Hearing Calendar / Management
- staff hearing management pages for admin and discipline officer
- hearing update endpoint
- hearing lists now usable as a management workspace instead of create-only

### Appeals Board
- student appeal submission page
- admin appeals review queue
- discipline officer appeals review queue
- appeal decision notes and review metadata

### Student Records Management Completion
- searchable/paginated student list backend
- admin create student modal wired to the POST route
- admin student profile detail/edit page with full history cards
- admin deactivate student modal flow
- admin parent-link action for students
- richer linked parent, case, hearing, sanction, and appeal context
- full student history now includes hearings and appeals

### Guidance Counselor Workspace Completion
- real counselor dashboard with recent notes, follow-up cases, and scheduled hearing visibility
- counselor case queue
- counselor case detail page with editable intervention notes
- counselor intervention / recommendation / behavior notes
- counselor access to student history and linked profile
- hearing, sanction, and appeal visibility from counselor case detail

### Parent Role Improvements
- parent dashboard now shows linked student overview
- linked student counts for cases, hearings, and sanctions
- child case, hearing, and sanction pages now use the same structured UI style as other roles
- teacher-filed cases can now trigger immediate SMS sends to linked parents when SMS is configured
- parent SMS attempts are logged to `sms_logs`
- teacher report flow now shows whether linked parents were texted, notified only in-app, or skipped because SMS is not enabled

### Frontend Completion and UI Polish
- student, parent, counselor, admin, discipline, and teacher role pages were wired to the implemented backend routes
- evidence upload is visible from case detail pages and evidence metadata now renders in the UI
- case, hearing, sanction, and appeal views use cards, badges, tables, and clearer page-level actions
- dedicated evidence center pages now link back into the appropriate case detail workflows
- shared role-based sidebar navigation now unifies the main workspaces across admin, discipline officer, teacher, counselor, student, and parent pages
- top-right profile area now includes a notification shortcut with unread badge support
- shared notifications center now provides filtering, unread tracking, and mark-as-read actions for all roles
- admin audit log viewer now surfaces system accountability events with search, filters, and pagination

## Preserved Stack and Architecture
- existing Express backend kept
- existing MySQL schema extended instead of replaced
- static HTML + shared JS frontend kept
- current role structure preserved:
  - admin
  - discipline_officer
  - teacher
  - guidance_counselor
  - student
  - parent
