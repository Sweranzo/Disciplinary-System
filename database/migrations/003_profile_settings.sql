USE disciplinary_system;

ALTER TABLE users
  ADD COLUMN avatar_path VARCHAR(255) NULL AFTER role;

