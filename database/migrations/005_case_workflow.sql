USE disciplinary_system;

ALTER TABLE cases
  ADD COLUMN review_status ENUM('pending_review', 'validated', 'incomplete', 'duplicate', 'needs_more_evidence') DEFAULT 'pending_review' AFTER status,
  ADD COLUMN workflow_status ENUM('reported', 'review', 'assignment', 'investigation', 'evidence_review', 'hearing', 'decision', 'sanction', 'appeal', 'closed') DEFAULT 'reported' AFTER review_status,
  ADD COLUMN next_action VARCHAR(100) DEFAULT 'review_report' AFTER workflow_status,
  ADD COLUMN next_action_notes TEXT NULL AFTER next_action,
  ADD COLUMN duplicate_of_case_id INT NULL AFTER next_action_notes,
  ADD COLUMN closed_by_user_id INT NULL AFTER parent_notified,
  ADD COLUMN closed_at TIMESTAMP NULL AFTER closed_by_user_id,
  ADD COLUMN closure_notes TEXT NULL AFTER closed_at,
  ADD CONSTRAINT fk_cases_duplicate_of
    FOREIGN KEY (duplicate_of_case_id) REFERENCES cases(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT fk_cases_closed_by
    FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;

ALTER TABLE hearings
  ADD COLUMN finding ENUM('pending', 'admitted', 'denied', 'resolved', 'dismissed', 'sanction_recommended', 'counseling_recommended') DEFAULT 'pending' AFTER outcome,
  ADD COLUMN recommendation TEXT NULL AFTER finding,
  ADD COLUMN result_recorded_by_user_id INT NULL AFTER recommendation,
  ADD COLUMN result_recorded_at TIMESTAMP NULL AFTER result_recorded_by_user_id,
  ADD CONSTRAINT fk_hearings_result_recorded_by
    FOREIGN KEY (result_recorded_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;

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

CREATE INDEX idx_cases_workflow_next_action ON cases(workflow_status, next_action);
CREATE INDEX idx_case_acknowledgements_case ON case_acknowledgements(case_id);
CREATE INDEX idx_case_workflow_events_case ON case_workflow_events(case_id, created_at);
