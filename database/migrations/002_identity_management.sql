USE disciplinary_system;

ALTER TABLE student_parents
  DROP FOREIGN KEY fk_student_parents_student,
  DROP FOREIGN KEY fk_student_parents_parent;

ALTER TABLE students
  DROP FOREIGN KEY fk_students_user;

ALTER TABLE parents
  DROP FOREIGN KEY fk_parents_user;

ALTER TABLE students
  MODIFY COLUMN user_id INT NULL,
  ADD COLUMN first_name VARCHAR(100) NULL AFTER student_number,
  ADD COLUMN middle_name VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN last_name VARCHAR(100) NULL AFTER middle_name,
  ADD COLUMN email VARCHAR(100) NULL AFTER last_name,
  ADD COLUMN record_status ENUM('active', 'inactive') DEFAULT 'active' AFTER qr_token;

UPDATE students s
JOIN users u ON s.user_id = u.id
SET
  s.first_name = COALESCE(s.first_name, u.first_name),
  s.middle_name = COALESCE(s.middle_name, u.middle_name),
  s.last_name = COALESCE(s.last_name, u.last_name),
  s.email = COALESCE(s.email, u.email),
  s.record_status = COALESCE(s.record_status, u.status);

ALTER TABLE parents
  MODIFY COLUMN user_id INT NULL,
  ADD COLUMN first_name VARCHAR(100) NULL AFTER user_id,
  ADD COLUMN middle_name VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN last_name VARCHAR(100) NULL AFTER middle_name,
  ADD COLUMN email VARCHAR(100) NULL AFTER last_name,
  ADD COLUMN record_status ENUM('active', 'inactive') DEFAULT 'active' AFTER address;

UPDATE parents p
JOIN users u ON p.user_id = u.id
SET
  p.first_name = COALESCE(p.first_name, u.first_name),
  p.middle_name = COALESCE(p.middle_name, u.middle_name),
  p.last_name = COALESCE(p.last_name, u.last_name),
  p.email = COALESCE(p.email, u.email),
  p.record_status = COALESCE(p.record_status, u.status);

ALTER TABLE students
  ADD CONSTRAINT fk_students_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL;

ALTER TABLE parents
  ADD CONSTRAINT fk_parents_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL;

ALTER TABLE student_parents
  ADD CONSTRAINT fk_student_parents_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT fk_student_parents_parent
    FOREIGN KEY (parent_id) REFERENCES parents(id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_student_parent_unique ON student_parents(student_id, parent_id);
CREATE INDEX idx_students_record_status ON students(record_status);
CREATE INDEX idx_parents_record_status ON parents(record_status);
