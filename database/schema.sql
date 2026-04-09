USE disciplinary_system;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS sms_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS appeals;
DROP TABLE IF EXISTS sanctions;
DROP TABLE IF EXISTS hearings;
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
    hearing_required TINYINT(1) DEFAULT 0,
    parent_notified TINYINT(1) DEFAULT 0,
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
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_evidence_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_case_evidence_user
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE hearings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    location VARCHAR(150) NULL,
    outcome TEXT NULL,
    status ENUM('scheduled', 'completed', 'cancelled') DEFAULT 'scheduled',
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_hearings_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_hearings_user
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT
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
        ON DELETE RESTRICT
);

CREATE TABLE appeals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    student_id INT NOT NULL,
    submitted_by_user_id INT NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('submitted', 'under_review', 'approved', 'rejected') DEFAULT 'submitted',
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
        ON DELETE RESTRICT
);

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
