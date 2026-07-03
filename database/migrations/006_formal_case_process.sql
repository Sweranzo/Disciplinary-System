USE disciplinary_system;

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

ALTER TABLE cases
  ADD COLUMN evidence_unavailable_reason TEXT NULL AFTER closure_notes,
  ADD COLUMN report_completeness_score INT DEFAULT 0 AFTER evidence_unavailable_reason,
  ADD COLUMN policy_basis_summary TEXT NULL AFTER report_completeness_score,
  ADD COLUMN appeal_deadline_at TIMESTAMP NULL AFTER policy_basis_summary,
  ADD COLUMN escalation_level ENUM('none', 'watch', 'overdue', 'critical') DEFAULT 'none' AFTER appeal_deadline_at,
  ADD COLUMN last_escalated_at TIMESTAMP NULL AFTER escalation_level;

ALTER TABLE case_evidence
  ADD COLUMN evidence_category ENUM('photo', 'video', 'document', 'screenshot', 'cctv', 'written_statement', 'medical_note', 'message_proof', 'other') DEFAULT 'other' AFTER file_size,
  ADD COLUMN evidence_purpose VARCHAR(160) NULL AFTER evidence_category,
  ADD COLUMN source_label VARCHAR(120) NULL AFTER evidence_purpose;

ALTER TABLE hearings
  ADD COLUMN attendance_summary TEXT NULL AFTER result_recorded_at;

ALTER TABLE sanctions
  ADD COLUMN completion_notes TEXT NULL AFTER status,
  ADD COLUMN completion_evidence_path VARCHAR(255) NULL AFTER completion_notes,
  ADD COLUMN completed_by_user_id INT NULL AFTER completion_evidence_path,
  ADD COLUMN completed_at TIMESTAMP NULL AFTER completed_by_user_id,
  ADD CONSTRAINT fk_sanctions_completed_by FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE appeals
  ADD COLUMN deadline_at TIMESTAMP NULL AFTER reason,
  ADD COLUMN eligibility_status ENUM('eligible', 'late', 'ineligible') DEFAULT 'eligible' AFTER deadline_at,
  ADD COLUMN eligibility_notes TEXT NULL AFTER eligibility_status;

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

CREATE INDEX idx_case_witnesses_case ON case_witnesses(case_id);
CREATE INDEX idx_case_statements_case ON case_statements(case_id);
CREATE INDEX idx_case_policy_refs_case ON case_policy_refs(case_id);
CREATE INDEX idx_case_decisions_case ON case_decisions(case_id);
CREATE INDEX idx_hearing_attendees_hearing ON hearing_attendees(hearing_id);
CREATE INDEX idx_case_packet_exports_case ON case_packet_exports(case_id);
