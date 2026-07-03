USE disciplinary_system;

SET @has_parent_notified := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'parent_notified'
);

SET @add_parent_notified := IF(
  @has_parent_notified = 0,
  'ALTER TABLE cases ADD COLUMN parent_notified TINYINT(1) DEFAULT 0 AFTER hearing_required',
  'SELECT 1'
);

PREPARE add_parent_notified_stmt FROM @add_parent_notified;
EXECUTE add_parent_notified_stmt;
DEALLOCATE PREPARE add_parent_notified_stmt;

CREATE TABLE IF NOT EXISTS sms_logs (
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
