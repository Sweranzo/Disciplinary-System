USE disciplinary_system;

ALTER TABLE case_evidence
  ADD COLUMN original_name VARCHAR(255) NULL AFTER file_type,
  ADD COLUMN file_size INT NULL AFTER original_name,
  ADD COLUMN review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' AFTER file_size,
  ADD COLUMN review_notes TEXT NULL AFTER review_status,
  ADD COLUMN reviewed_by_user_id INT NULL AFTER review_notes,
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by_user_id,
  ADD CONSTRAINT fk_case_evidence_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;

ALTER TABLE appeals
  ADD COLUMN decision_notes TEXT NULL AFTER status,
  ADD COLUMN reviewed_by_user_id INT NULL AFTER decision_notes,
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by_user_id,
  ADD CONSTRAINT fk_appeals_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;

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

CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_student ON cases(student_id);
CREATE INDEX idx_cases_reported_by ON cases(reported_by_user_id);
CREATE INDEX idx_cases_assigned_to ON cases(assigned_to_user_id);
CREATE INDEX idx_hearings_case_status_date ON hearings(case_id, status, scheduled_date);
CREATE INDEX idx_sanctions_student_status ON sanctions(student_id, status);
CREATE INDEX idx_appeals_case_status ON appeals(case_id, status);
CREATE INDEX idx_case_evidence_case_status ON case_evidence(case_id, review_status);
CREATE INDEX idx_counselor_interventions_case_status ON counselor_interventions(case_id, status);
