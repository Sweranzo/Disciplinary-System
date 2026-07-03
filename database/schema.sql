USE disciplinary_system;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS case_messages;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS case_conversations;
DROP TABLE IF EXISTS email_logs;
DROP TABLE IF EXISTS sms_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS case_workflow_events;
DROP TABLE IF EXISTS case_acknowledgements;
DROP TABLE IF EXISTS appeals;
DROP TABLE IF EXISTS sanctions;
DROP TABLE IF EXISTS hearings;
DROP TABLE IF EXISTS counselor_interventions;
DROP TABLE IF EXISTS case_evidence;
DROP TABLE IF EXISTS case_updates;
DROP TABLE IF EXISTS cases;
DROP TABLE IF EXISTS student_parents;
DROP TABLE IF EXISTS parents;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_or_student_id VARCHAR(50) UNIQUE NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM(
        'admin',
        'discipline_officer',
        'teacher',
        'guidance_counselor',
        'student',
        'parent'
    ) NOT NULL,
    avatar_path VARCHAR(255) NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NULL,
    student_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    email VARCHAR(100) NULL,
    qr_token VARCHAR(255) UNIQUE NULL,
    record_status ENUM('active', 'inactive') DEFAULT 'active',
    department VARCHAR(100) NULL,
    program VARCHAR(100) NULL,
    year_level VARCHAR(50) NULL,
    section VARCHAR(50) NULL,
    academic_level ENUM('college', 'shs') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_students_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NULL,
    first_name VARCHAR(100) NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    email VARCHAR(100) NULL,
    phone_number VARCHAR(30) NULL,
    address TEXT NULL,
    record_status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_parents_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE student_parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    parent_id INT NOT NULL,
    relationship VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_parents_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_student_parents_parent
        FOREIGN KEY (parent_id) REFERENCES parents(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_student_parent UNIQUE (student_id, parent_id)
);

CREATE TABLE cases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_number VARCHAR(50) UNIQUE NOT NULL,
    student_id INT NOT NULL,
    reported_by_user_id INT NOT NULL,
    assigned_to_user_id INT NULL,
    violation_type VARCHAR(150) NOT NULL,
    severity_level ENUM('minor', 'major', 'grave') NOT NULL,
    incident_date DATE NOT NULL,
    incident_time TIME NULL,
    location VARCHAR(150) NULL,
    description TEXT NOT NULL,
    status ENUM(
        'pending',
        'under_investigation',
        'hearing_scheduled',
        'dismissed',
        'resolved'
    ) DEFAULT 'pending',
    review_status ENUM('pending_review', 'validated', 'incomplete', 'duplicate', 'needs_more_evidence') DEFAULT 'pending_review',
    workflow_status ENUM('reported', 'review', 'assignment', 'investigation', 'evidence_review', 'hearing', 'decision', 'sanction', 'appeal', 'closed') DEFAULT 'reported',
    next_action VARCHAR(100) DEFAULT 'review_report',
    next_action_notes TEXT NULL,
    duplicate_of_case_id INT NULL,
    hearing_required TINYINT(1) DEFAULT 0,
    parent_notified TINYINT(1) DEFAULT 0,
    closed_by_user_id INT NULL,
    closed_at TIMESTAMP NULL,
    closure_notes TEXT NULL,
    evidence_unavailable_reason TEXT NULL,
    report_completeness_score INT DEFAULT 0,
    policy_basis_summary TEXT NULL,
    appeal_deadline_at TIMESTAMP NULL,
    escalation_level ENUM('none', 'watch', 'overdue', 'critical') DEFAULT 'none',
    last_escalated_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cases_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_cases_reported_by
        FOREIGN KEY (reported_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_cases_assigned_to
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_cases_duplicate_of
        FOREIGN KEY (duplicate_of_case_id) REFERENCES cases(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_cases_closed_by
        FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE case_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    updated_by_user_id INT NOT NULL,
    update_type ENUM(
        'note',
        'investigation',
        'witness_statement',
        'status_change',
        'hearing_note',
        'other'
    ) DEFAULT 'note',
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_updates_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_updates_user
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE case_evidence (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    uploaded_by_user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NULL,
    original_name VARCHAR(255) NULL,
    file_size INT NULL,
    evidence_category ENUM('photo', 'video', 'document', 'screenshot', 'cctv', 'written_statement', 'medical_note', 'message_proof', 'other') DEFAULT 'other',
    evidence_purpose VARCHAR(160) NULL,
    source_label VARCHAR(120) NULL,
    review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    review_notes TEXT NULL,
    reviewed_by_user_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_evidence_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_evidence_user
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_case_evidence_reviewed_by
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE counselor_interventions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    student_id INT NOT NULL,
    counselor_user_id INT NOT NULL,
    note_type ENUM('intervention', 'behavior_note', 'recommendation', 'follow_up') DEFAULT 'intervention',
    note TEXT NOT NULL,
    status ENUM('planned', 'ongoing', 'completed') DEFAULT 'planned',
    follow_up_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_counselor_interventions_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_counselor_interventions_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_counselor_interventions_user
        FOREIGN KEY (counselor_user_id) REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE hearings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    location VARCHAR(150) NULL,
    outcome TEXT NULL,
    finding ENUM('pending', 'admitted', 'denied', 'resolved', 'dismissed', 'sanction_recommended', 'counseling_recommended') DEFAULT 'pending',
    recommendation TEXT NULL,
    result_recorded_by_user_id INT NULL,
    result_recorded_at TIMESTAMP NULL,
    attendance_summary TEXT NULL,
    status ENUM('scheduled', 'completed', 'cancelled', 'missed') DEFAULT 'scheduled',
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_hearings_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_hearings_user
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_hearings_result_recorded_by
        FOREIGN KEY (result_recorded_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE sanctions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    student_id INT NOT NULL,
    sanction_type VARCHAR(150) NOT NULL,
    description TEXT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status ENUM('active', 'fulfilled', 'cancelled') DEFAULT 'active',
    completion_notes TEXT NULL,
    completion_evidence_path VARCHAR(255) NULL,
    completed_by_user_id INT NULL,
    completed_at TIMESTAMP NULL,
    assigned_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sanctions_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_user
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sanctions_completed_by
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE appeals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    student_id INT NOT NULL,
    submitted_by_user_id INT NOT NULL,
    reason TEXT NOT NULL,
    deadline_at TIMESTAMP NULL,
    eligibility_status ENUM('eligible', 'late', 'ineligible') DEFAULT 'eligible',
    eligibility_notes TEXT NULL,
    status ENUM('submitted', 'under_review', 'approved', 'rejected') DEFAULT 'submitted',
    decision_notes TEXT NULL,
    reviewed_by_user_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_appeals_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_appeals_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_appeals_user
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_appeals_reviewed_by
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE case_report_drafts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_by_user_id INT NOT NULL,
    student_id INT NULL,
    student_number VARCHAR(50) NULL,
    violation_type VARCHAR(100) NULL,
    severity_level ENUM('minor', 'major', 'grave') NULL,
    incident_date DATE NULL,
    incident_time TIME NULL,
    location VARCHAR(150) NULL,
    description TEXT NULL,
    evidence_unavailable_reason TEXT NULL,
    completeness_score INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_report_drafts_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_report_drafts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE case_witnesses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    role VARCHAR(80) NULL,
    contact_info VARCHAR(160) NULL,
    notes TEXT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_witnesses_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_witnesses_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE case_statements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    submitted_by_user_id INT NOT NULL,
    subject_role ENUM('student', 'parent', 'teacher', 'witness', 'staff') NOT NULL,
    statement_type ENUM('student_response', 'parent_response', 'witness_statement', 'teacher_clarification', 'staff_note') NOT NULL,
    content TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_statements_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_statements_user FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE policy_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(160) NOT NULL,
    description TEXT NULL,
    default_severity ENUM('minor', 'major', 'grave') NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE case_policy_refs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    policy_rule_id INT NULL,
    policy_code VARCHAR(50) NULL,
    title VARCHAR(160) NOT NULL,
    notes TEXT NULL,
    added_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_policy_refs_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_policy_refs_rule FOREIGN KEY (policy_rule_id) REFERENCES policy_rules(id) ON DELETE SET NULL,
    CONSTRAINT fk_case_policy_refs_user FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE case_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    finding ENUM('responsible', 'not_responsible', 'resolved', 'dismissed', 'insufficient_evidence') NOT NULL,
    basis TEXT NOT NULL,
    recommended_action TEXT NULL,
    requires_approval TINYINT(1) DEFAULT 0,
    status ENUM('draft', 'pending_approval', 'approved', 'rejected') DEFAULT 'draft',
    decided_by_user_id INT NOT NULL,
    decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_decisions_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_decisions_user FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE case_decision_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    decision_id INT NOT NULL,
    approver_user_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    notes TEXT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_decision_approvals_decision FOREIGN KEY (decision_id) REFERENCES case_decisions(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_decision_approvals_user FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE hearing_attendees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hearing_id INT NOT NULL,
    case_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    role ENUM('student', 'parent', 'teacher', 'discipline_officer', 'guidance_counselor', 'admin', 'witness', 'other') NOT NULL,
    attendance_status ENUM('invited', 'present', 'absent', 'excused') DEFAULT 'invited',
    notes TEXT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hearing_attendees_hearing FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE CASCADE,
    CONSTRAINT fk_hearing_attendees_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_hearing_attendees_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE case_sla_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    next_action VARCHAR(100) NOT NULL UNIQUE,
    max_hours INT NOT NULL,
    escalation_role VARCHAR(50) DEFAULT 'admin',
    active TINYINT(1) DEFAULT 1
);

CREATE TABLE case_packet_exports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    exported_by_user_id INT NOT NULL,
    packet_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_packet_exports_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_case_packet_exports_user FOREIGN KEY (exported_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO case_sla_rules (next_action, max_hours, escalation_role) VALUES
    ('review_report', 24, 'admin'),
    ('needs_assignment', 24, 'admin'),
    ('needs_more_evidence', 72, 'discipline_officer'),
    ('needs_evidence_review', 48, 'discipline_officer'),
    ('schedule_hearing', 72, 'discipline_officer'),
    ('awaiting_hearing_result', 24, 'discipline_officer'),
    ('issue_sanction', 48, 'admin'),
    ('counseling_follow_up', 72, 'guidance_counselor'),
    ('awaiting_appeal_review', 72, 'admin'),
    ('closure_checklist', 48, 'admin');

CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_workflow_next_action ON cases(workflow_status, next_action);
CREATE INDEX idx_cases_student ON cases(student_id);
CREATE INDEX idx_cases_reported_by ON cases(reported_by_user_id);
CREATE INDEX idx_cases_assigned_to ON cases(assigned_to_user_id);
CREATE INDEX idx_hearings_case_status_date ON hearings(case_id, status, scheduled_date);
CREATE INDEX idx_sanctions_student_status ON sanctions(student_id, status);
CREATE INDEX idx_appeals_case_status ON appeals(case_id, status);
CREATE INDEX idx_case_evidence_case_status ON case_evidence(case_id, review_status);
CREATE INDEX idx_counselor_interventions_case_status ON counselor_interventions(case_id, status);
CREATE INDEX idx_case_witnesses_case ON case_witnesses(case_id);
CREATE INDEX idx_case_statements_case ON case_statements(case_id);
CREATE INDEX idx_case_policy_refs_case ON case_policy_refs(case_id);
CREATE INDEX idx_case_decisions_case ON case_decisions(case_id);
CREATE INDEX idx_hearing_attendees_hearing ON hearing_attendees(hearing_id);
CREATE INDEX idx_case_packet_exports_case ON case_packet_exports(case_id);

CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('system', 'case', 'sanction', 'hearing', 'appeal', 'sms') DEFAULT 'system',
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE case_acknowledgements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(50) NOT NULL,
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_acknowledgements_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_acknowledgements_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_case_acknowledgement_user UNIQUE (case_id, user_id)
);

CREATE TABLE case_workflow_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    user_id INT NULL,
    event_type VARCHAR(80) NOT NULL,
    title VARCHAR(160) NOT NULL,
    details TEXT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_workflow_events_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_workflow_events_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_case_acknowledgements_case ON case_acknowledgements(case_id);
CREATE INDEX idx_case_workflow_events_case ON case_workflow_events(case_id, created_at);

CREATE TABLE sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NULL,
    parent_id INT NULL,
    phone_number VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    delivery_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    failure_reason TEXT NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sms_logs_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_sms_logs_parent
        FOREIGN KEY (parent_id) REFERENCES parents(id)
        ON DELETE SET NULL
);

CREATE TABLE email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NULL,
    student_id INT NULL,
    parent_id INT NULL,
    user_id INT NULL,
    recipient_role VARCHAR(50) NOT NULL DEFAULT 'student',
    email_address VARCHAR(150) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    delivery_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    failure_reason TEXT NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_logs_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_email_logs_student
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_email_logs_parent
        FOREIGN KEY (parent_id) REFERENCES parents(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_email_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_email_logs_case ON email_logs(case_id);
CREATE INDEX idx_email_logs_student ON email_logs(student_id);
CREATE INDEX idx_email_logs_created_at ON email_logs(created_at);

CREATE TABLE case_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    subject VARCHAR(180) NOT NULL,
    status ENUM('open', 'closed', 'archived') DEFAULT 'open',
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_conversations_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_conversations_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE conversation_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(50) NULL,
    last_read_at TIMESTAMP NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conversation_participants_conversation
        FOREIGN KEY (conversation_id) REFERENCES case_conversations(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_conversation_participants_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_conversation_participant UNIQUE (conversation_id, user_id)
);

CREATE TABLE case_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_user_id INT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_case_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES case_conversations(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_messages_sender
        FOREIGN KEY (sender_user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_case_conversations_case ON case_conversations(case_id);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_case_messages_conversation_created ON case_messages(conversation_id, created_at);

CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NULL,
    target_id INT NULL,
    details TEXT NULL,
    ip_address VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
);
