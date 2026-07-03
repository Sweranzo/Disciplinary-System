const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const QRCode = require("qrcode");

const ALLOWED_ROLES = [
  "admin",
  "discipline_officer",
  "guidance_counselor",
  "teacher",
  "student",
  "parent"
];

const ACCOUNT_STATUSES = ["active", "inactive"];
const STUDENT_LEVELS = ["college", "shs"];
const PASSWORD_POLICY_MESSAGE = "Password must be at least 8 characters and include a letter, number, and special character.";

function normalizeRole(role) {
  return ALLOWED_ROLES.includes(role) ? role : null;
}

function normalizeStatus(status) {
  return ACCOUNT_STATUSES.includes(status) ? status : "active";
}

function validateEmail(email) {
  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function generateQrToken() {
  return `qr_${crypto.randomBytes(12).toString("hex")}`;
}

async function generateQrDataUrl(studentNumber, qrToken) {
  const payload = JSON.stringify({
    type: "student_identity",
    studentNumber: studentNumber || null,
    qrToken
  });

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220
  });
}

function validatePasswordPolicy(password) {
  const value = String(password || "");
  return value.length >= 8
    && /[A-Za-z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

function assertPasswordPolicy(password) {
  if (!validatePasswordPolicy(password)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
}

function generateTemporaryPassword(length = 12) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "!@#$%";
  const all = `${letters}${numbers}${specials}`;
  const targetLength = Math.max(8, length);
  const chars = [
    letters[crypto.randomInt(letters.length)],
    numbers[crypto.randomInt(numbers.length)],
    specials[crypto.randomInt(specials.length)]
  ];

  while (chars.length < targetLength) {
    chars.push(all[crypto.randomInt(all.length)]);
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join("");
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function assertUniqueUserFields(connection, fields, excludeUserId = null) {
  const checks = [
    { key: "username", column: "username", value: fields.username },
    { key: "email", column: "email", value: fields.email },
    { key: "employeeOrStudentId", column: "employee_or_student_id", value: fields.employeeOrStudentId }
  ].filter(item => item.value);

  for (const check of checks) {
    const params = [check.value];
    let sql = `SELECT id FROM users WHERE ${check.column} = ?`;

    if (excludeUserId) {
      sql += " AND id <> ?";
      params.push(excludeUserId);
    }

    sql += " LIMIT 1";

    const [rows] = await connection.query(sql, params);
    if (rows.length) {
      const label = check.key === "employeeOrStudentId" ? "ID number" : check.key;
      throw new Error(`${label} already exists.`);
    }
  }
}

async function getStudentRecord(connection, studentId) {
  const [rows] = await connection.query(
    `
    SELECT *
    FROM students
    WHERE id = ?
    LIMIT 1
    `,
    [studentId]
  );

  return rows[0] || null;
}

async function getParentRecord(connection, parentId) {
  const [rows] = await connection.query(
    `
    SELECT *
    FROM parents
    WHERE id = ?
    LIMIT 1
    `,
    [parentId]
  );

  return rows[0] || null;
}

async function createUserRecord(connection, payload) {
  const role = normalizeRole(payload.role);
  if (!role) {
    throw new Error("Invalid role.");
  }

  if (!payload.username || !payload.email || !payload.password || !payload.firstName || !payload.lastName) {
    throw new Error("Username, email, password, first name, and last name are required.");
  }

  if (!validateEmail(payload.email)) {
    throw new Error("A valid email address is required.");
  }

  assertPasswordPolicy(payload.password);

  await assertUniqueUserFields(connection, {
    username: payload.username.trim(),
    email: payload.email.trim(),
    employeeOrStudentId: payload.employeeOrStudentId ? payload.employeeOrStudentId.trim() : null
  });

  const passwordHash = await hashPassword(payload.password);
  const [result] = await connection.query(
    `
    INSERT INTO users
    (
      employee_or_student_id,
      username,
      email,
      password_hash,
      first_name,
      middle_name,
      last_name,
      role,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.employeeOrStudentId ? payload.employeeOrStudentId.trim() : null,
      payload.username.trim(),
      payload.email.trim(),
      passwordHash,
      payload.firstName.trim(),
      payload.middleName ? payload.middleName.trim() : null,
      payload.lastName.trim(),
      role,
      normalizeStatus(payload.status)
    ]
  );

  return result.insertId;
}

async function createStudentRecord(connection, payload) {
  if (!payload.studentNumber || !payload.firstName || !payload.lastName || !payload.academicLevel) {
    throw new Error("Student number, first name, last name, and academic level are required.");
  }

  if (!STUDENT_LEVELS.includes(payload.academicLevel)) {
    throw new Error("Invalid academic level.");
  }

  const [studentRows] = await connection.query(
    `
    SELECT id
    FROM students
    WHERE student_number = ?
    LIMIT 1
    `,
    [payload.studentNumber.trim()]
  );

  if (studentRows.length) {
    throw new Error("Student number already exists.");
  }

  if (payload.email && !validateEmail(payload.email)) {
    throw new Error("A valid student email address is required.");
  }

  const qrToken = payload.qrToken || generateQrToken();
  const [result] = await connection.query(
    `
    INSERT INTO students
    (
      user_id,
      student_number,
      first_name,
      middle_name,
      last_name,
      email,
      department,
      program,
      year_level,
      section,
      academic_level,
      qr_token,
      record_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.userId || null,
      payload.studentNumber.trim(),
      payload.firstName.trim(),
      payload.middleName ? payload.middleName.trim() : null,
      payload.lastName.trim(),
      payload.email ? payload.email.trim() : null,
      payload.department ? payload.department.trim() : null,
      payload.program ? payload.program.trim() : null,
      payload.yearLevel ? payload.yearLevel.trim() : null,
      payload.section ? payload.section.trim() : null,
      payload.academicLevel,
      qrToken,
      normalizeStatus(payload.recordStatus)
    ]
  );

  return {
    id: result.insertId,
    qrToken
  };
}

async function createParentRecord(connection, payload) {
  if (!payload.firstName || !payload.lastName) {
    throw new Error("Parent first name and last name are required.");
  }

  if (payload.email && !validateEmail(payload.email)) {
    throw new Error("A valid parent email address is required.");
  }

  const [duplicateRows] = await connection.query(
    `
    SELECT id
    FROM parents
    WHERE LOWER(first_name) = LOWER(?)
      AND LOWER(last_name) = LOWER(?)
      AND (
        (? IS NOT NULL AND email = ?)
        OR (? IS NOT NULL AND phone_number = ?)
      )
    LIMIT 1
    `,
    [
      payload.firstName.trim(),
      payload.lastName.trim(),
      payload.email ? payload.email.trim() : null,
      payload.email ? payload.email.trim() : null,
      payload.phoneNumber ? payload.phoneNumber.trim() : null,
      payload.phoneNumber ? payload.phoneNumber.trim() : null
    ]
  );

  if (duplicateRows.length) {
    throw new Error("A similar parent record already exists.");
  }

  const [result] = await connection.query(
    `
    INSERT INTO parents
    (
      user_id,
      first_name,
      middle_name,
      last_name,
      email,
      phone_number,
      address,
      record_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.userId || null,
      payload.firstName.trim(),
      payload.middleName ? payload.middleName.trim() : null,
      payload.lastName.trim(),
      payload.email ? payload.email.trim() : null,
      payload.phoneNumber ? payload.phoneNumber.trim() : null,
      payload.address ? payload.address.trim() : null,
      normalizeStatus(payload.recordStatus)
    ]
  );

  return result.insertId;
}

async function linkParentStudent(connection, studentId, parentId, relationship = "Parent/Guardian") {
  const [existingRows] = await connection.query(
    `
    SELECT id
    FROM student_parents
    WHERE student_id = ? AND parent_id = ?
    LIMIT 1
    `,
    [studentId, parentId]
  );

  if (existingRows.length) {
    throw new Error("Parent already linked to this student.");
  }

  await connection.query(
    `
    INSERT INTO student_parents
    (student_id, parent_id, relationship)
    VALUES (?, ?, ?)
    `,
    [studentId, parentId, relationship || "Parent/Guardian"]
  );
}

module.exports = {
  ALLOWED_ROLES,
  ACCOUNT_STATUSES,
  STUDENT_LEVELS,
  normalizeRole,
  normalizeStatus,
  validateEmail,
  PASSWORD_POLICY_MESSAGE,
  validatePasswordPolicy,
  assertPasswordPolicy,
  generateQrToken,
  generateQrDataUrl,
  generateTemporaryPassword,
  hashPassword,
  assertUniqueUserFields,
  getStudentRecord,
  getParentRecord,
  createUserRecord,
  createStudentRecord,
  createParentRecord,
  linkParentStudent
};
