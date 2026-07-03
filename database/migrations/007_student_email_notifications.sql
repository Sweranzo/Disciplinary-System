USE disciplinary_system;

ALTER TABLE hearings
  MODIFY COLUMN status ENUM('scheduled', 'completed', 'cancelled', 'missed') DEFAULT 'scheduled';

CREATE TABLE IF NOT EXISTS email_logs (
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
