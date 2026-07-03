const pool = require("../config/db");
const path = require("path");
const { logAudit } = require("../utils/auditLogger");
const { createWorker } = require("tesseract.js");
const {
  ALLOWED_ROLES,
  normalizeRole,
  normalizeStatus,
  validateEmail,
  generateQrDataUrl,
  generateTemporaryPassword,
  hashPassword,
  assertPasswordPolicy,
  assertUniqueUserFields,
  getStudentRecord,
  getParentRecord,
  createUserRecord,
  createStudentRecord,
  createParentRecord,
  linkParentStudent
} = require("../utils/identityService");
const { parseMasterlistText } = require("../utils/masterlistOcrParser");
const { sendAccountCredentialsEmail } = require("../utils/emailService");
const { sendSms, renderSmsTemplate } = require("../utils/smsService");
const OCR_LANG_PATH = path.join(__dirname, "..", "node_modules", "@tesseract.js-data", "eng", "4.0.0");

function getPortalUrl() {
  return String(process.env.FRONTEND_URL || process.env.PORTAL_URL || "http://127.0.0.1:5500/frontend/pages/auth/login.html").trim();
}

async function sendEnrollmentNotifications({ credentials = [], userId = null, ipAddress = null }) {
  for (const credential of credentials) {
    await sendAccountCredentialsEmail({
      credential,
      studentId: credential.studentId || null,
      parentId: credential.parentId || null,
      userId: credential.userId || null
    });
  }

  for (const credential of credentials.filter(item => item.role === "parent")) {
    if (!credential.phoneNumber) {
      continue;
    }

    await sendSms({
      parentId: credential.parentId || null,
      phoneNumber: credential.phoneNumber,
      userId,
      ipAddress,
      message: renderSmsTemplate("accountCredentials", {
        recipientName: credential.name || "Parent/Guardian",
        roleLabel: "parent",
        username: credential.username,
        password: credential.password,
        portalUrl: getPortalUrl()
      })
    });
  }
}

function getPageMeta(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

function escapeLike(value) {
  return `%${String(value || "").trim()}%`;
}

function slugifyUsernamePart(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildStudentUsernameBase(row = {}) {
  const firstName = slugifyUsernamePart(row.firstName);
  const lastName = slugifyUsernamePart(row.lastName);
  const studentDigits = String(row.studentNumber || "").replace(/\D/g, "").slice(-4);
  const baseName = firstName || "student";
  const lastInitial = lastName ? lastName[0] : "";
  return `${baseName}${lastInitial}${studentDigits}` || `student${Date.now()}`;
}

function buildParentUsernameBase(row = {}) {
  const firstName = slugifyUsernamePart(row.parentFirstName || row.firstName);
  const lastName = slugifyUsernamePart(row.parentLastName || row.lastName);
  const phoneDigits = String(row.parentPhoneNumber || row.phoneNumber || "").replace(/\D/g, "").slice(-4);
  return `${firstName || "parent"}${lastName ? lastName[0] : ""}${phoneDigits}` || `parent${Date.now()}`;
}

async function isUsernameAvailable(connection, username) {
  const [rows] = await connection.query(
    `
    SELECT id
    FROM users
    WHERE username = ?
    LIMIT 1
    `,
    [username]
  );

  return rows.length === 0;
}

async function generateUniqueParentUsername(connection, row, reservedUsernames) {
  const base = buildParentUsernameBase(row).slice(0, 36) || "parent";
  let candidate = base;
  let suffix = 1;

  while (reservedUsernames.has(candidate) || !(await isUsernameAvailable(connection, candidate))) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  reservedUsernames.add(candidate);
  return candidate;
}

async function generateUniqueStudentUsername(connection, row, reservedUsernames) {
  const base = buildStudentUsernameBase(row).slice(0, 36) || "student";
  let candidate = base;
  let suffix = 1;

  while (reservedUsernames.has(candidate) || !(await isUsernameAvailable(connection, candidate))) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  reservedUsernames.add(candidate);
  return candidate;
}

function hasReviewedParent(row = {}) {
  return Boolean(
    String(row.parentFirstName || "").trim()
      || String(row.parentLastName || "").trim()
      || String(row.parentEmail || "").trim()
      || String(row.parentPhoneNumber || "").trim()
  );
}

async function findExistingParentForImport(connection, row = {}) {
  const email = row.parentEmail ? String(row.parentEmail).trim() : "";
  const phoneNumber = row.parentPhoneNumber ? String(row.parentPhoneNumber).trim() : "";

  if (!email && !phoneNumber) {
    return null;
  }

  const params = [];
  const clauses = [];

  if (email) {
    clauses.push("email = ?");
    params.push(email);
  }

  if (phoneNumber) {
    clauses.push("phone_number = ?");
    params.push(phoneNumber);
  }

  const [rows] = await connection.query(
    `
    SELECT id, user_id
    FROM parents
    WHERE ${clauses.join(" OR ")}
    ORDER BY id ASC
    LIMIT 1
    `,
    params
  );

  return rows[0] || null;
}

async function listUsers(req, res) {
  try {
    const { page, limit, offset } = getPageMeta(req);
    const params = [];
    let whereClause = "";

    if (req.query.search) {
      whereClause += `
        WHERE (
          u.username LIKE ?
          OR u.email LIKE ?
          OR u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR u.employee_or_student_id LIKE ?
        )
      `;
      const pattern = escapeLike(req.query.search);
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (req.query.role && ALLOWED_ROLES.includes(req.query.role)) {
      whereClause += whereClause ? " AND u.role = ?" : " WHERE u.role = ?";
      params.push(req.query.role);
    }

    if (req.query.status && ["active", "inactive"].includes(req.query.status)) {
      whereClause += whereClause ? " AND u.status = ?" : " WHERE u.status = ?";
      params.push(req.query.status);
    }

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM users u
      ${whereClause}
      `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.employee_or_student_id,
        u.username,
        u.email,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.role,
        u.status,
        u.created_at,
        s.id AS student_id,
        p.id AS parent_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN parents p ON p.user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      users: rows.map(row => ({
        ...row,
        linked_profile_type: row.student_id ? "student" : row.parent_id ? "parent" : null,
        linked_profile_id: row.student_id || row.parent_id || null
      })),
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(1, Math.ceil(countRows[0].total / limit))
      }
    });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching accounts." });
  }
}

async function createUser(req, res) {
  const connection = await pool.getConnection();

  try {
    const {
      employeeOrStudentId,
      username,
      email,
      password,
      firstName,
      middleName,
      lastName,
      role,
      status,
      studentId,
      parentId
    } = req.body;

    if (role === "student" && !studentId) {
      return res.status(400).json({
        success: false,
        message: "Student accounts must be linked to an existing student record. Create the student from Student Records first."
      });
    }

    if (role === "parent" && !parentId) {
      return res.status(400).json({
        success: false,
        message: "Parent accounts must be linked to an existing parent record. Create the parent record first."
      });
    }

    await connection.beginTransaction();

    const userId = await createUserRecord(connection, {
      employeeOrStudentId,
      username,
      email,
      password,
      firstName,
      middleName,
      lastName,
      role,
      status
    });

    if (role === "student" && studentId) {
      const student = await getStudentRecord(connection, studentId);
      if (!student) {
        throw new Error("Student record not found.");
      }
      if (student.user_id) {
        throw new Error("Student record already has a linked account.");
      }

      await connection.query(
        `
        UPDATE students
        SET user_id = ?, email = ?, record_status = ?
        WHERE id = ?
        `,
        [userId, email.trim(), normalizeStatus(status), studentId]
      );
    }

    if (role === "parent" && parentId) {
      const parent = await getParentRecord(connection, parentId);
      if (!parent) {
        throw new Error("Parent record not found.");
      }
      if (parent.user_id) {
        throw new Error("Parent record already has a linked account.");
      }

      await connection.query(
        `
        UPDATE parents
        SET user_id = ?, email = ?, record_status = ?
        WHERE id = ?
        `,
        [userId, email.trim(), normalizeStatus(status), parentId]
      );
    }

    await connection.commit();

    await logAudit({
      userId: req.user.id,
      action: "CREATE_USER_ACCOUNT",
      targetTable: "users",
      targetId: userId,
      details: `Created ${role} account for ${username}`,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully."
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create account."
    });
  } finally {
    connection.release();
  }
}

async function updateUser(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const {
      employeeOrStudentId,
      username,
      email,
      firstName,
      middleName,
      lastName,
      role,
      status
    } = req.body;

    const [rows] = await connection.query(
      `
      SELECT
        u.*,
        s.id AS student_id,
        p.id AS parent_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const existing = rows[0];
    const nextRole = existing.student_id
      ? "student"
      : existing.parent_id
        ? "parent"
        : normalizeRole(role || existing.role);

    if (!nextRole) {
      return res.status(400).json({ success: false, message: "Invalid role." });
    }

    if (!username || !email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Username, email, first name, and last name are required."
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }

    await assertUniqueUserFields(connection, {
      username: username.trim(),
      email: email.trim(),
      employeeOrStudentId: employeeOrStudentId ? employeeOrStudentId.trim() : null
    }, id);

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE users
      SET
        employee_or_student_id = ?,
        username = ?,
        email = ?,
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        role = ?,
        status = ?
      WHERE id = ?
      `,
      [
        employeeOrStudentId ? employeeOrStudentId.trim() : null,
        username.trim(),
        email.trim(),
        firstName.trim(),
        middleName ? middleName.trim() : null,
        lastName.trim(),
        nextRole,
        normalizeStatus(status || existing.status),
        id
      ]
    );

    if (existing.student_id) {
      await connection.query(
        `
        UPDATE students
        SET
          student_number = COALESCE(?, student_number),
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          email = ?,
          record_status = ?
        WHERE id = ?
        `,
        [
          employeeOrStudentId ? employeeOrStudentId.trim() : null,
          firstName.trim(),
          middleName ? middleName.trim() : null,
          lastName.trim(),
          email.trim(),
          normalizeStatus(status || existing.status),
          existing.student_id
        ]
      );
    }

    if (existing.parent_id) {
      await connection.query(
        `
        UPDATE parents
        SET
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          email = ?,
          record_status = ?
        WHERE id = ?
        `,
        [
          firstName.trim(),
          middleName ? middleName.trim() : null,
          lastName.trim(),
          email.trim(),
          normalizeStatus(status || existing.status),
          existing.parent_id
        ]
      );
    }

    await connection.commit();

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_USER_ACCOUNT",
      targetTable: "users",
      targetId: Number(id),
      details: `Updated account ${username}`,
      ipAddress: req.ip
    });

    return res.json({ success: true, message: "Account updated successfully." });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to update account."
    });
  } finally {
    connection.release();
  }
}

async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const nextStatus = normalizeStatus(req.body.status);

    const [rows] = await pool.query(
      `
      SELECT u.id, s.id AS student_id, p.id AS parent_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    await pool.query(`UPDATE users SET status = ? WHERE id = ?`, [nextStatus, id]);

    if (rows[0].student_id) {
      await pool.query(`UPDATE students SET record_status = ? WHERE id = ?`, [nextStatus, rows[0].student_id]);
    }

    if (rows[0].parent_id) {
      await pool.query(`UPDATE parents SET record_status = ? WHERE id = ?`, [nextStatus, rows[0].parent_id]);
    }

    return res.json({ success: true, message: "Account status updated." });
  } catch (error) {
    console.error("Update account status error:", error);
    return res.status(500).json({ success: false, message: "Server error while updating status." });
  }
}

async function listAuditLogs(req, res) {
  try {
    const { page, limit, offset } = getPageMeta(req);
    const params = [];
    let whereClause = "";

    if (req.query.search) {
      whereClause += `
        WHERE (
          al.action LIKE ?
          OR al.target_table LIKE ?
          OR al.details LIKE ?
          OR u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR u.username LIKE ?
        )
      `;
      const pattern = escapeLike(req.query.search);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (req.query.action) {
      whereClause += whereClause ? " AND al.action = ?" : " WHERE al.action = ?";
      params.push(req.query.action);
    }

    if (req.query.targetTable) {
      whereClause += whereClause ? " AND al.target_table = ?" : " WHERE al.target_table = ?";
      params.push(req.query.targetTable);
    }

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        al.id,
        al.action,
        al.target_table,
        al.target_id,
        al.details,
        al.ip_address,
        al.created_at,
        u.id AS actor_user_id,
        u.username,
        u.role,
        u.first_name,
        u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [actionRows] = await pool.query(
      `
      SELECT action, COUNT(*) AS total
      FROM audit_logs
      GROUP BY action
      ORDER BY total DESC, action ASC
      LIMIT 20
      `
    );

    return res.json({
      success: true,
      logs: rows,
      actionOptions: actionRows,
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(1, Math.ceil(countRows[0].total / limit))
      }
    });
  } catch (error) {
    console.error("List audit logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching audit logs."
    });
  }
}

async function resetPassword(req, res) {
  try {
    const { id } = req.params;
    const password = req.body.password || generateTemporaryPassword();
    assertPasswordPolicy(password);
    const passwordHash = await hashPassword(password);

    const [result] = await pool.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
      `,
      [passwordHash, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    return res.json({
      success: true,
      message: "Password reset successfully.",
      temporaryPassword: password
    });
  } catch (error) {
    console.error("Reset password error:", error);
    if (error.message && error.message.includes("Password must be")) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({ success: false, message: "Server error while resetting password." });
  }
}

async function deleteUser(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [rows] = await connection.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.email,
        u.status,
        s.id AS student_id,
        p.id AS parent_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const account = rows[0];

    await connection.beginTransaction();

    if (account.student_id) {
      await connection.query(
        `
        UPDATE students
        SET
          user_id = NULL,
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          middle_name = COALESCE(middle_name, ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          email = COALESCE(NULLIF(email, ''), ?),
          record_status = ?
        WHERE id = ?
        `,
        [
          account.first_name,
          account.middle_name,
          account.last_name,
          account.email,
          normalizeStatus(account.status),
          account.student_id
        ]
      );
    }

    if (account.parent_id) {
      await connection.query(
        `
        UPDATE parents
        SET
          user_id = NULL,
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          middle_name = COALESCE(middle_name, ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          email = COALESCE(NULLIF(email, ''), ?),
          record_status = ?
        WHERE id = ?
        `,
        [
          account.first_name,
          account.middle_name,
          account.last_name,
          account.email,
          normalizeStatus(account.status),
          account.parent_id
        ]
      );
    }

    const [result] = await connection.query(
      `
      DELETE FROM users
      WHERE id = ?
      `,
      [id]
    );

    if (!result.affectedRows) {
      throw new Error("Account could not be deleted.");
    }

    await connection.commit();

    await logAudit({
      userId: req.user.id,
      action: "DELETE_USER_ACCOUNT",
      targetTable: "users",
      targetId: Number(id),
      details: `Deleted account ${account.username}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Account deleted successfully."
    });
  } catch (error) {
    await connection.rollback();

    const message = error && (error.code === "ER_ROW_IS_REFERENCED_2" || error.errno === 1451)
      ? "This account is still referenced by case, evidence, hearing, sanction, or appeal history. Deactivate it instead of deleting."
      : (error.message || "Unable to delete account.");

    return res.status(400).json({
      success: false,
      message
    });
  } finally {
    connection.release();
  }
}

async function listParents(req, res) {
  try {
    const { page, limit, offset } = getPageMeta(req);
    const params = [];
    let whereClause = "";

    if (req.query.search) {
      whereClause += `
        WHERE (
          COALESCE(u.first_name, p.first_name) LIKE ?
          OR COALESCE(u.last_name, p.last_name) LIKE ?
          OR COALESCE(u.email, p.email) LIKE ?
          OR p.phone_number LIKE ?
        )
      `;
      const pattern = escapeLike(req.query.search);
      params.push(pattern, pattern, pattern, pattern);
    }

    if (req.query.status && ["active", "inactive"].includes(req.query.status)) {
      whereClause += whereClause ? " AND COALESCE(u.status, p.record_status) = ?" : " WHERE COALESCE(u.status, p.record_status) = ?";
      params.push(req.query.status);
    }

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM parents p
      LEFT JOIN users u ON p.user_id = u.id
      ${whereClause}
      `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        COALESCE(u.first_name, p.first_name) AS first_name,
        COALESCE(u.middle_name, p.middle_name) AS middle_name,
        COALESCE(u.last_name, p.last_name) AS last_name,
        COALESCE(u.email, p.email) AS email,
        COALESCE(u.status, p.record_status) AS status,
        p.phone_number,
        p.address,
        COUNT(sp.student_id) AS linked_students
      FROM parents p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN student_parents sp ON sp.parent_id = p.id
      ${whereClause}
      GROUP BY
        p.id,
        p.user_id,
        u.first_name,
        p.first_name,
        u.middle_name,
        p.middle_name,
        u.last_name,
        p.last_name,
        u.email,
        p.email,
        u.status,
        p.record_status,
        p.phone_number,
        p.address
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      parents: rows.map(item => ({
        ...item,
        has_account: Boolean(item.user_id)
      })),
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(1, Math.ceil(countRows[0].total / limit))
      }
    });
  } catch (error) {
    console.error("List parents error:", error);
    return res.status(500).json({ success: false, message: "Server error while fetching parents." });
  }
}

async function getParentOptions(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        COALESCE(u.first_name, p.first_name) AS first_name,
        COALESCE(u.last_name, p.last_name) AS last_name,
        COALESCE(u.email, p.email) AS email,
        p.phone_number
      FROM parents p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY COALESCE(u.last_name, p.last_name), COALESCE(u.first_name, p.first_name)
      `
    );

    return res.json({ success: true, parents: rows });
  } catch (error) {
    console.error("Parent options error:", error);
    return res.status(500).json({ success: false, message: "Server error while loading parents." });
  }
}

async function getStudentOptions(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.student_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        COALESCE(u.email, s.email) AS email,
        s.user_id
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.student_number DESC
      `
    );

    return res.json({ success: true, students: rows });
  } catch (error) {
    console.error("Student options error:", error);
    return res.status(500).json({ success: false, message: "Server error while loading students." });
  }
}

async function createParent(req, res) {
  const connection = await pool.getConnection();

  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      phoneNumber,
      address,
      createAccount,
      username,
      password,
      status
    } = req.body;

    if (!firstName || !lastName) {
      throw new Error("Parent first name and last name are required.");
    }

    if (!phoneNumber || !String(phoneNumber).trim()) {
      throw new Error("Parent phone number is required for SMS notifications.");
    }

    await connection.beginTransaction();

    let userId = null;

    if (createAccount) {
      userId = await createUserRecord(connection, {
        employeeOrStudentId: null,
        username,
        email,
        password,
        firstName,
        middleName,
        lastName,
        role: "parent",
        status
      });
    }

    const parentId = await createParentRecord(connection, {
      userId,
      firstName,
      middleName,
      lastName,
      email,
      phoneNumber,
      address,
      recordStatus: status
    });

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Parent record created successfully.",
      parentId
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create parent record."
    });
  } finally {
    connection.release();
  }
}

async function updateParent(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { firstName, middleName, lastName, email, phoneNumber, address, status } = req.body;

    const parent = await getParentRecord(connection, id);
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent record not found." });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "First name and last name are required." });
    }

    if (email && !validateEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }

    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, message: "Parent phone number is required for SMS notifications." });
    }

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE parents
      SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        email = ?,
        phone_number = ?,
        address = ?,
        record_status = ?
      WHERE id = ?
      `,
      [
        firstName.trim(),
        middleName ? middleName.trim() : null,
        lastName.trim(),
        email ? email.trim() : null,
        phoneNumber ? phoneNumber.trim() : null,
        address ? address.trim() : null,
        normalizeStatus(status || parent.record_status),
        id
      ]
    );

    if (parent.user_id) {
      await assertUniqueUserFields(connection, {
        username: null,
        email: email ? email.trim() : null,
        employeeOrStudentId: null
      }, parent.user_id);

      await connection.query(
        `
        UPDATE users
        SET
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          email = ?,
          status = ?
        WHERE id = ?
        `,
        [
          firstName.trim(),
          middleName ? middleName.trim() : null,
          lastName.trim(),
          email ? email.trim() : null,
          normalizeStatus(status || parent.record_status),
          parent.user_id
        ]
      );
    }

    await connection.commit();

    return res.json({ success: true, message: "Parent record updated." });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to update parent record."
    });
  } finally {
    connection.release();
  }
}

async function createStudent(req, res) {
  const connection = await pool.getConnection();

  try {
    const {
      studentNumber,
      firstName,
      middleName,
      lastName,
      email,
      department,
      program,
      yearLevel,
      section,
      academicLevel,
      status,
      relationship,
      newParent
    } = req.body;

    await connection.beginTransaction();

    let userId = null;
    const credentials = [];
    const studentEmail = email ? String(email).trim() : "";

    if (studentEmail) {
      const generatedUsername = await generateUniqueStudentUsername(connection, {
        studentNumber,
        firstName,
        lastName
      }, new Set());
      const generatedPassword = generateTemporaryPassword();
      userId = await createUserRecord(connection, {
        employeeOrStudentId: studentNumber,
        username: generatedUsername,
        email: studentEmail,
        password: generatedPassword,
        firstName,
        middleName,
        lastName,
        role: "student",
        status
      });

      credentials.push({
        role: "student",
        userId,
        studentId: null,
        studentNumber,
        name: [firstName, middleName, lastName].filter(Boolean).join(" "),
        username: generatedUsername,
        password: generatedPassword,
        email: studentEmail,
        generatedUsername: true,
        generatedPassword: true
      });
    }

    const createdStudent = await createStudentRecord(connection, {
      userId,
      studentNumber,
      firstName,
      middleName,
      lastName,
      email,
      department,
      program,
      yearLevel,
      section,
      academicLevel,
      recordStatus: status
    });

    credentials
      .filter(credential => credential.role === "student")
      .forEach(credential => {
        credential.studentId = createdStudent.id;
      });

    const hasManualParentDetails = newParent && Boolean(
      String(newParent.firstName || "").trim()
        || String(newParent.lastName || "").trim()
        || String(newParent.email || "").trim()
        || String(newParent.phoneNumber || "").trim()
    );

    if (hasManualParentDetails) {
      if (!newParent.firstName || !newParent.lastName) {
        throw new Error("Parent first name and last name are required when parent details are provided.");
      }

      let parentUserId = null;
      const parentEmail = newParent.email ? String(newParent.email).trim() : "";

      if (parentEmail) {
        const parentUsername = await generateUniqueParentUsername(connection, {
          parentFirstName: newParent.firstName,
          parentLastName: newParent.lastName,
          parentPhoneNumber: newParent.phoneNumber
        }, new Set(credentials.map(credential => credential.username)));
        const parentPassword = generateTemporaryPassword();
        parentUserId = await createUserRecord(connection, {
          employeeOrStudentId: null,
          username: parentUsername,
          email: parentEmail,
          password: parentPassword,
          firstName: newParent.firstName,
          middleName: newParent.middleName,
          lastName: newParent.lastName,
          role: "parent",
          status
        });

        credentials.push({
          role: "parent",
          userId: parentUserId,
          parentId: null,
          studentNumber,
          name: [newParent.firstName, newParent.middleName, newParent.lastName].filter(Boolean).join(" "),
          username: parentUsername,
          password: parentPassword,
          email: parentEmail,
          phoneNumber: newParent.phoneNumber || "",
          generatedUsername: true,
          generatedPassword: true
        });
      }

      const parentId = await createParentRecord(connection, {
        userId: parentUserId,
        firstName: newParent.firstName,
        middleName: newParent.middleName,
        lastName: newParent.lastName,
        email: newParent.email,
        phoneNumber: newParent.phoneNumber,
        address: newParent.address,
        recordStatus: status
      });

      credentials
        .filter(credential => credential.role === "parent")
        .forEach(credential => {
          credential.parentId = parentId;
        });

      await linkParentStudent(connection, createdStudent.id, parentId, relationship || "Parent/Guardian");
    }

    await connection.commit();

    const parentCredentials = credentials.filter(item => item.role === "parent");
    const parentSmsTargets = parentCredentials.filter(item => item.phoneNumber);
    const emailNotifications = {
      attempted: credentials.length,
      queued: credentials.length,
      sent: 0,
      failed: 0,
      disabled: 0,
      details: []
    };

    const smsNotifications = {
      attempted: parentSmsTargets.length,
      queued: parentSmsTargets.length,
      sent: 0,
      failed: 0,
      disabled: 0,
      skipped: parentCredentials.length - parentSmsTargets.length
    };

    const notificationUserId = req.user?.id || null;
    const notificationIpAddress = req.ip;

    setImmediate(() => {
      sendEnrollmentNotifications({
        credentials,
        userId: notificationUserId,
        ipAddress: notificationIpAddress
      }).catch(error => {
        console.error("Enrollment notification dispatch error:", error);
      });
    });

    return res.status(201).json({
      success: true,
      message: "Student record created successfully.",
      studentId: createdStudent.id,
      qrToken: createdStudent.qrToken,
      credentials,
      emailNotifications,
      smsNotifications
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create student."
    });
  } finally {
    connection.release();
  }
}

async function createStudentAccount(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { username, email, password, status } = req.body;
    const student = await getStudentRecord(connection, id);

    if (!student) {
      return res.status(404).json({ success: false, message: "Student record not found." });
    }

    if (student.user_id) {
      return res.status(400).json({ success: false, message: "Student already has a linked account." });
    }

    await connection.beginTransaction();

    const userId = await createUserRecord(connection, {
      employeeOrStudentId: student.student_number,
      username,
      email,
      password,
      firstName: student.first_name,
      middleName: student.middle_name,
      lastName: student.last_name,
      role: "student",
      status: status || student.record_status
    });

    await connection.query(
      `
      UPDATE students
      SET user_id = ?, email = ?, record_status = ?
      WHERE id = ?
      `,
      [userId, email.trim(), normalizeStatus(status || student.record_status), id]
    );

    await connection.commit();

    return res.json({ success: true, message: "Student account created and linked." });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create student account."
    });
  } finally {
    connection.release();
  }
}

async function deleteStudent(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const student = await getStudentRecord(connection, id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student record not found." });
    }

    const [parentRows] = await connection.query(
      `
      SELECT p.id, p.user_id
      FROM student_parents sp
      JOIN parents p ON sp.parent_id = p.id
      WHERE sp.student_id = ?
      `,
      [id]
    );

    await connection.beginTransaction();

    await connection.query(
      `
      DELETE FROM students
      WHERE id = ?
      `,
      [id]
    );

    let deletedStudentAccount = 0;
    if (student.user_id) {
      const [userDelete] = await connection.query(
        `
        DELETE FROM users
        WHERE id = ?
        `,
        [student.user_id]
      );
      deletedStudentAccount = userDelete.affectedRows || 0;
    }

    let deletedParentProfiles = 0;
    let deletedParentAccounts = 0;

    for (const parent of parentRows) {
      const [linkRows] = await connection.query(
        `
        SELECT COUNT(*) AS linked_count
        FROM student_parents
        WHERE parent_id = ?
        `,
        [parent.id]
      );

      if (Number(linkRows[0]?.linked_count || 0) > 0) {
        continue;
      }

      await connection.query(
        `
        DELETE FROM parents
        WHERE id = ?
        `,
        [parent.id]
      );
      deletedParentProfiles += 1;

      if (parent.user_id) {
        const [parentUserDelete] = await connection.query(
          `
          DELETE FROM users
          WHERE id = ?
          `,
          [parent.user_id]
        );
        deletedParentAccounts += parentUserDelete.affectedRows || 0;
      }
    }

    await logAudit({
      userId: req.user.id,
      action: "DELETE_STUDENT",
      targetTable: "students",
      targetId: Number(id),
      details: `Deleted student ${student.student_number}. Deleted student account: ${deletedStudentAccount}. Deleted orphan parent profiles: ${deletedParentProfiles}.`,
      ipAddress: req.ip
    });

    await connection.commit();

    return res.json({
      success: true,
      message: "Student deleted successfully.",
      deletedStudentAccount,
      deletedParentProfiles,
      deletedParentAccounts
    });
  } catch (error) {
    await connection.rollback();
    console.error("Delete student error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to delete student."
    });
  } finally {
    connection.release();
  }
}

async function createParentAccount(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { username, email, password, status } = req.body;
    const parent = await getParentRecord(connection, id);

    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent record not found." });
    }

    if (parent.user_id) {
      return res.status(400).json({ success: false, message: "Parent already has a linked account." });
    }

    await connection.beginTransaction();

    const userId = await createUserRecord(connection, {
      employeeOrStudentId: null,
      username,
      email,
      password,
      firstName: parent.first_name,
      middleName: parent.middle_name,
      lastName: parent.last_name,
      role: "parent",
      status: status || parent.record_status
    });

    await connection.query(
      `
      UPDATE parents
      SET user_id = ?, email = ?, record_status = ?
      WHERE id = ?
      `,
      [userId, email.trim(), normalizeStatus(status || parent.record_status), id]
    );

    await connection.commit();

    return res.json({ success: true, message: "Parent account created and linked." });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create parent account."
    });
  } finally {
    connection.release();
  }
}

async function linkParentToStudentAdmin(req, res) {
  const connection = await pool.getConnection();

  try {
    const { parentId, studentId, relationship } = req.body;

    if (!parentId || !studentId) {
      return res.status(400).json({ success: false, message: "Parent and student are required." });
    }

    const student = await getStudentRecord(connection, studentId);
    const parent = await getParentRecord(connection, parentId);

      if (!student || !parent) {
        return res.status(404).json({ success: false, message: "Student or parent record not found." });
      }

      if (!parent.phone_number || !String(parent.phone_number).trim()) {
        return res.status(400).json({ success: false, message: "Parent phone number is required before linking for SMS notifications." });
      }

      await linkParentStudent(connection, studentId, parentId, relationship);

    return res.json({ success: true, message: "Parent linked successfully." });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to link parent."
    });
  } finally {
    connection.release();
  }
}

async function scanStudentMasterlist(req, res) {
  let worker = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Masterlist image is required."
      });
    }

    worker = await createWorker("eng", 1, {
      langPath: OCR_LANG_PATH
    });
    const result = await worker.recognize(req.file.buffer);
    const rawText = result?.data?.text || "";
    const parsedRows = parseMasterlistText(rawText);
    const studentNumbers = parsedRows.map(row => row.studentNumber).filter(Boolean);
    let existingNumbers = new Set();

    if (studentNumbers.length) {
      const placeholders = studentNumbers.map(() => "?").join(", ");
      const [existingRows] = await pool.query(
        `
        SELECT student_number
        FROM students
        WHERE student_number IN (${placeholders})
        `,
        studentNumbers
      );
      existingNumbers = new Set(existingRows.map(row => row.student_number));
    }

    const rows = parsedRows.map(row => {
      const issues = [...row.issues];
      if (existingNumbers.has(row.studentNumber)) {
        issues.push("Duplicate student number already exists");
      }

      return {
        ...row,
        duplicate: existingNumbers.has(row.studentNumber),
        confidence: issues.length ? "needs_review" : "ready",
        issues
      };
    });

    await logAudit({
      userId: req.user.id,
      action: "SCAN_STUDENT_MASTERLIST",
      targetTable: "students",
      targetId: null,
      details: `Scanned masterlist image and detected ${rows.length} possible student rows.`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: rows.length ? "Masterlist scan completed. Review detected rows before importing." : "No student rows were detected. Try a clearer image.",
      rawText,
      rows,
      summary: {
        detected: rows.length,
        ready: rows.filter(row => row.confidence === "ready").length,
        needsReview: rows.filter(row => row.confidence !== "ready").length,
        duplicates: rows.filter(row => row.duplicate).length,
        parentRows: rows.filter(row => hasReviewedParent(row)).length
      }
    });
  } catch (error) {
    console.error("Scan student masterlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while scanning the masterlist image."
    });
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

async function bulkImport(req, res) {
  const connection = await pool.getConnection();

  try {
    const { importType, createLoginAccounts, createParentLoginAccounts, rows } = req.body;

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ success: false, message: "Import rows are required." });
    }

    const summary = {
      importType,
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
      accountWarnings: [],
      parentCreated: 0,
      parentLinked: 0,
      parentSkipped: 0,
      parentAccountWarnings: [],
      credentials: [],
      emailNotifications: {
        attempted: 0,
        sent: 0,
        failed: 0,
        disabled: 0
      }
    };
    const reservedUsernames = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;
      let createdCredential = null;
      const rowCredentials = [];

      try {
        await connection.beginTransaction();

        if (importType === "students") {
          let userId = null;
          let accountWarning = null;
          if (createLoginAccounts) {
            const username = row.username
              ? String(row.username).trim()
              : await generateUniqueStudentUsername(connection, row, reservedUsernames);
            const password = row.password || generateTemporaryPassword();
            const email = row.email ? String(row.email).trim() : "";

            if (email) {
              userId = await createUserRecord(connection, {
                employeeOrStudentId: row.studentNumber,
                username,
                email,
                password,
                firstName: row.firstName,
                middleName: row.middleName,
                lastName: row.lastName,
                role: "student",
                status: row.status || "active"
              });

              createdCredential = {
                row: rowNumber,
                role: "student",
                userId,
                studentId: null,
                studentNumber: row.studentNumber,
                name: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" "),
                username,
                password,
                email,
                generatedUsername: !row.username,
                generatedPassword: !row.password,
                generatedEmail: false
              };
            } else {
              accountWarning = "Login account was not created because email is blank.";
            }
          }

          const createdStudent = await createStudentRecord(connection, {
            userId,
            studentNumber: row.studentNumber,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            email: row.email,
            department: row.department,
            program: row.program,
            yearLevel: row.yearLevel,
            section: row.section,
            academicLevel: row.academicLevel || "college",
            recordStatus: row.status || "active"
          });

          if (createdCredential) {
            createdCredential.studentId = createdStudent.id;
            rowCredentials.push(createdCredential);
          }

          if (hasReviewedParent(row)) {
            if (!row.parentFirstName || !row.parentLastName || !row.parentPhoneNumber) {
              summary.parentSkipped += 1;
              summary.parentAccountWarnings.push({
                row: rowNumber,
                studentNumber: row.studentNumber,
                message: "Parent was not imported because first name, last name, or phone number is blank."
              });
            } else {
              let parentId = null;
              const existingParent = await findExistingParentForImport(connection, row);

              if (existingParent) {
                parentId = existingParent.id;
              } else {
                let parentUserId = null;
                let parentAccountWarning = null;
                if (createParentLoginAccounts) {
                  const parentEmail = row.parentEmail ? String(row.parentEmail).trim() : "";
                  if (parentEmail) {
                    const parentUsername = row.parentUsername
                      ? String(row.parentUsername).trim()
                      : await generateUniqueParentUsername(connection, row, reservedUsernames);
                    const parentPassword = row.parentPassword || generateTemporaryPassword();
                    parentUserId = await createUserRecord(connection, {
                      employeeOrStudentId: null,
                      username: parentUsername,
                      email: parentEmail,
                      password: parentPassword,
                      firstName: row.parentFirstName,
                      middleName: row.parentMiddleName,
                      lastName: row.parentLastName,
                      role: "parent",
                      status: row.status || "active"
                    });

                    rowCredentials.push({
                      row: rowNumber,
                      role: "parent",
                      userId: parentUserId,
                      parentId: null,
                      studentNumber: row.studentNumber,
                      name: [row.parentFirstName, row.parentMiddleName, row.parentLastName].filter(Boolean).join(" "),
                      username: parentUsername,
                      password: parentPassword,
                      email: parentEmail,
                      generatedUsername: !row.parentUsername,
                      generatedPassword: !row.parentPassword,
                      generatedEmail: false
                    });
                  } else {
                    parentAccountWarning = "Parent login account was not created because parent email is blank.";
                  }
                }

                parentId = await createParentRecord(connection, {
                  userId: parentUserId,
                  firstName: row.parentFirstName,
                  middleName: row.parentMiddleName,
                  lastName: row.parentLastName,
                  email: row.parentEmail,
                  phoneNumber: row.parentPhoneNumber,
                  address: row.parentAddress,
                  recordStatus: row.status || "active"
                });
                summary.parentCreated += 1;

                rowCredentials
                  .filter(credential => credential.role === "parent" && credential.parentId === null)
                  .forEach(credential => {
                    credential.parentId = parentId;
                  });

                if (parentAccountWarning) {
                  summary.parentAccountWarnings.push({
                    row: rowNumber,
                    studentNumber: row.studentNumber,
                    message: parentAccountWarning
                  });
                }
              }

              await linkParentStudent(connection, createdStudent.id, parentId, row.parentRelationship || "Parent/Guardian");
              summary.parentLinked += 1;
            }
          }

          if (accountWarning) {
            summary.accountWarnings.push({
              row: rowNumber,
              studentNumber: row.studentNumber,
              message: accountWarning
            });
          }
        } else if (["teachers", "discipline_officers", "guidance_counselors", "admins"].includes(importType)) {
          const roleMap = {
            teachers: "teacher",
            discipline_officers: "discipline_officer",
            guidance_counselors: "guidance_counselor",
            admins: "admin"
          };

          await createUserRecord(connection, {
            employeeOrStudentId: row.employeeOrStudentId,
            username: row.username,
            email: row.email,
            password: row.password || generateTemporaryPassword(),
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            role: roleMap[importType],
            status: row.status || "active"
          });
        } else if (importType === "parents") {
          let userId = null;
          if (createLoginAccounts) {
            userId = await createUserRecord(connection, {
              employeeOrStudentId: null,
              username: row.username,
              email: row.email,
              password: row.password || generateTemporaryPassword(),
              firstName: row.firstName,
              middleName: row.middleName,
              lastName: row.lastName,
              role: "parent",
              status: row.status || "active"
            });
          }

          await createParentRecord(connection, {
            userId,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            email: row.email,
            phoneNumber: row.phoneNumber,
            address: row.address,
            recordStatus: row.status || "active"
          });
        } else {
          throw new Error("Unsupported import type.");
        }

        await connection.commit();
        summary.created += 1;
        summary.credentials.push(...rowCredentials);

        for (const credential of rowCredentials) {
          summary.emailNotifications.attempted += 1;
          const emailResult = await sendAccountCredentialsEmail({
            credential,
            studentId: credential.studentId || null,
            parentId: credential.parentId || null,
            userId: credential.userId || null
          });

          if (emailResult.success) {
            summary.emailNotifications.sent += 1;
          } else if (emailResult.status === "disabled") {
            summary.emailNotifications.disabled += 1;
          } else {
            summary.emailNotifications.failed += 1;
          }
        }
      } catch (error) {
        await connection.rollback();
        summary.skipped += 1;
        summary.errors.push({
          row: rowNumber,
          message: error.message || "Row failed to import."
        });
      }
    }

    return res.json({
      success: true,
      message: "Bulk import processed.",
      summary
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return res.status(500).json({ success: false, message: "Server error during bulk import." });
  } finally {
    connection.release();
  }
}

function buildBulkStudentDeleteFilter(filters = {}) {
  const params = [];
  let whereClause = "WHERE 1 = 1";

  if (filters.search) {
    whereClause += `
      AND (
        s.student_number LIKE ?
        OR COALESCE(u.first_name, s.first_name) LIKE ?
        OR COALESCE(u.last_name, s.last_name) LIKE ?
        OR COALESCE(u.email, s.email) LIKE ?
      )
    `;
    const pattern = `%${String(filters.search).trim()}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (filters.status) {
    whereClause += " AND COALESCE(u.status, s.record_status) = ?";
    params.push(filters.status);
  }

  if (filters.accountType === "with_account") {
    whereClause += " AND s.user_id IS NOT NULL";
  } else if (filters.accountType === "profile_only") {
    whereClause += " AND s.user_id IS NULL";
  }

  if (filters.academicLevel && ["college", "shs"].includes(filters.academicLevel)) {
    whereClause += " AND s.academic_level = ?";
    params.push(filters.academicLevel);
  }

  if (filters.program) {
    whereClause += " AND s.program = ?";
    params.push(String(filters.program).trim());
  }

  if (filters.yearLevel) {
    whereClause += " AND s.year_level = ?";
    params.push(String(filters.yearLevel).trim());
  }

  if (filters.section) {
    whereClause += " AND s.section = ?";
    params.push(String(filters.section).trim());
  }

  return { whereClause, params };
}

function hasSafeBulkDeleteScope(filters = {}) {
  const scopedFilters = ["academicLevel", "program", "yearLevel", "section", "search"]
    .filter(key => String(filters[key] || "").trim());

  return Boolean(filters.section) || scopedFilters.length >= 2;
}

async function bulkDeleteStudents(req, res) {
  const connection = await pool.getConnection();

  try {
    const filters = req.body?.filters || {};
    const dryRun = Boolean(req.body?.dryRun);

    if (!hasSafeBulkDeleteScope(filters)) {
      return res.status(400).json({
        success: false,
        message: "Choose a section, or at least two filters such as program and year level, before bulk deleting students."
      });
    }

    const { whereClause, params } = buildBulkStudentDeleteFilter(filters);
    const [matchedRows] = await connection.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.student_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.middle_name, s.middle_name) AS middle_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        COALESCE(u.email, s.email) AS email,
        s.program,
        s.year_level,
        s.section,
        s.academic_level,
        COALESCE(u.status, s.record_status) AS status,
        u.username
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.student_number ASC
      `,
      params
    );

    const selectedIds = Array.isArray(req.body?.studentIds)
      ? new Set(req.body.studentIds.map(id => Number(id)).filter(Boolean))
      : null;
    const rows = selectedIds
      ? matchedRows.filter(row => selectedIds.has(Number(row.id)))
      : matchedRows;
    const count = rows.length;
    const confirmText = `DELETE ${count} STUDENTS`;

    if (!count) {
      return res.json({
        success: true,
        dryRun,
        count: 0,
        confirmText,
        sample: [],
        message: "No students match the selected filters."
      });
    }

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        count,
        confirmText,
        sample: rows.slice(0, 8).map(row => row.student_number),
        students: rows.map(row => ({
          id: row.id,
          studentNumber: row.student_number,
          firstName: row.first_name,
          middleName: row.middle_name,
          lastName: row.last_name,
          email: row.email,
          program: row.program,
          yearLevel: row.year_level,
          section: row.section,
          academicLevel: row.academic_level,
          status: row.status,
          username: row.username,
          hasAccount: Boolean(row.user_id)
        })),
        message: `${count} student record(s) match the selected filters.`
      });
    }

    if (req.body?.confirmText !== confirmText) {
      return res.status(400).json({
        success: false,
        count,
        confirmText,
        message: `Type "${confirmText}" to confirm this bulk delete.`
      });
    }

    await connection.beginTransaction();

    const studentIds = rows.map(row => row.id);
    const userIds = rows.map(row => row.user_id).filter(Boolean);
    const studentPlaceholders = studentIds.map(() => "?").join(", ");
    const [parentRows] = await connection.query(
      `
      SELECT
        p.id,
        p.user_id,
        COUNT(DISTINCT sp_all.student_id) AS linked_student_count,
        COUNT(DISTINCT CASE WHEN sp_all.student_id IN (${studentPlaceholders}) THEN sp_all.student_id END) AS selected_student_count
      FROM parents p
      JOIN student_parents sp_selected
        ON sp_selected.parent_id = p.id
        AND sp_selected.student_id IN (${studentPlaceholders})
      LEFT JOIN student_parents sp_all
        ON sp_all.parent_id = p.id
      GROUP BY p.id, p.user_id
      HAVING linked_student_count = selected_student_count
      `,
      [...studentIds, ...studentIds]
    );
    const parentIds = parentRows.map(row => row.id).filter(Boolean);
    const parentUserIds = parentRows.map(row => row.user_id).filter(Boolean);

    await connection.query(
      `DELETE FROM students WHERE id IN (${studentPlaceholders})`,
      studentIds
    );

    if (userIds.length) {
      const userPlaceholders = userIds.map(() => "?").join(", ");
      await connection.query(
        `DELETE FROM users WHERE role = 'student' AND id IN (${userPlaceholders})`,
        userIds
      );
    }

    if (parentIds.length) {
      const parentPlaceholders = parentIds.map(() => "?").join(", ");
      await connection.query(
        `DELETE FROM parents WHERE id IN (${parentPlaceholders})`,
        parentIds
      );
    }

    if (parentUserIds.length) {
      const parentUserPlaceholders = parentUserIds.map(() => "?").join(", ");
      await connection.query(
        `DELETE FROM users WHERE role = 'parent' AND id IN (${parentUserPlaceholders})`,
        parentUserIds
      );
    }

    await logAudit({
      userId: req.user.id,
      action: "BULK_DELETE_STUDENTS",
      targetTable: "students",
      targetId: null,
      details: `Bulk deleted ${count} student records, ${parentIds.length} parent profiles, and ${parentUserIds.length} parent accounts using filters: ${JSON.stringify(filters)}.`,
      ipAddress: req.ip
    });

    await connection.commit();

    return res.json({
      success: true,
      deleted: count,
      deletedAccounts: userIds.length,
      deletedParentProfiles: parentIds.length,
      deletedParentAccounts: parentUserIds.length,
      message: `Deleted ${count} student record(s).`
    });
  } catch (error) {
    await connection.rollback();
    console.error("Bulk delete students error:", error);
    return res.status(500).json({ success: false, message: "Server error while bulk deleting students." });
  } finally {
    connection.release();
  }
}

async function linkExistingUserToProfile(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { studentId, parentId } = req.body;

    const [userRows] = await connection.query(
      `
      SELECT
        u.id,
        u.role,
        u.email,
        u.first_name,
        u.middle_name,
        u.last_name,
        s.id AS linked_student_id,
        p.id AS linked_parent_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const user = userRows[0];

    if (user.linked_student_id || user.linked_parent_id) {
      return res.status(400).json({
        success: false,
        message: "This account is already linked to a profile."
      });
    }

    await connection.beginTransaction();

    if (user.role === "student") {
      if (!studentId) {
        throw new Error("Select a student profile to link.");
      }

      const student = await getStudentRecord(connection, studentId);
      if (!student) {
        throw new Error("Student record not found.");
      }
      if (student.user_id) {
        throw new Error("Student record already has a linked account.");
      }

      await connection.query(
        `
        UPDATE students
        SET
          user_id = ?,
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          middle_name = COALESCE(middle_name, ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          email = COALESCE(NULLIF(email, ''), ?),
          record_status = COALESCE(record_status, 'active')
        WHERE id = ?
        `,
        [
          id,
          user.first_name,
          user.middle_name,
          user.last_name,
          user.email,
          studentId
        ]
      );
    } else if (user.role === "parent") {
      if (!parentId) {
        throw new Error("Select a parent profile to link.");
      }

      const parent = await getParentRecord(connection, parentId);
      if (!parent) {
        throw new Error("Parent record not found.");
      }
      if (parent.user_id) {
        throw new Error("Parent record already has a linked account.");
      }

      await connection.query(
        `
        UPDATE parents
        SET
          user_id = ?,
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          middle_name = COALESCE(middle_name, ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          email = COALESCE(NULLIF(email, ''), ?),
          record_status = COALESCE(record_status, 'active')
        WHERE id = ?
        `,
        [
          id,
          user.first_name,
          user.middle_name,
          user.last_name,
          user.email,
          parentId
        ]
      );
    } else {
      throw new Error("Only orphan student or parent accounts can be repaired with profile linking.");
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Account linked to profile successfully."
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to link account to profile."
    });
  } finally {
    connection.release();
  }
}

async function listSmsLogs(req, res) {
  try {
    const { page, limit, offset } = getPageMeta(req);
    const params = [];
    let whereClause = "";

    if (req.query.search) {
      whereClause += `
        WHERE (
          sl.phone_number LIKE ?
          OR sl.message LIKE ?
          OR sl.delivery_status LIKE ?
          OR c.case_number LIKE ?
          OR COALESCE(pu.first_name, p.first_name) LIKE ?
          OR COALESCE(pu.last_name, p.last_name) LIKE ?
        )
      `;
      const pattern = escapeLike(req.query.search);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (req.query.status) {
      whereClause += whereClause ? " AND sl.delivery_status = ?" : " WHERE sl.delivery_status = ?";
      params.push(req.query.status);
    }

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM sms_logs sl
      LEFT JOIN cases c ON sl.case_id = c.id
      LEFT JOIN parents p ON sl.parent_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      ${whereClause}
      `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        sl.id,
        sl.case_id,
        sl.parent_id,
        sl.phone_number,
        sl.message,
        sl.delivery_status,
        sl.failure_reason,
        sl.sent_at,
        sl.created_at,
        c.case_number,
        COALESCE(pu.first_name, p.first_name) AS parent_first_name,
        COALESCE(pu.last_name, p.last_name) AS parent_last_name
      FROM sms_logs sl
      LEFT JOIN cases c ON sl.case_id = c.id
      LEFT JOIN parents p ON sl.parent_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      ${whereClause}
      ORDER BY COALESCE(sl.sent_at, sl.created_at) DESC, sl.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [statusRows] = await pool.query(
      `
      SELECT delivery_status, COUNT(*) AS total
      FROM sms_logs
      GROUP BY delivery_status
      ORDER BY total DESC, delivery_status ASC
      `
    );

    return res.json({
      success: true,
      logs: rows,
      statusOptions: statusRows,
      pagination: {
        page,
        limit,
        total: countRows[0]?.total || 0,
        totalPages: Math.max(1, Math.ceil((countRows[0]?.total || 0) / limit))
      }
    });
  } catch (error) {
    console.error("List SMS logs error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching SMS logs."
    });
  }
}

async function deleteSmsLog(req, res) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `
      DELETE FROM sms_logs
      WHERE id = ?
      `,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "SMS log not found." });
    }

    return res.json({ success: true, message: "SMS log deleted successfully." });
  } catch (error) {
    console.error("Delete SMS log error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting SMS log." });
  }
}

async function clearSmsLogs(req, res) {
  try {
    await pool.query("DELETE FROM sms_logs");
    return res.json({ success: true, message: "SMS history cleared successfully." });
  } catch (error) {
    console.error("Clear SMS logs error:", error);
    return res.status(500).json({ success: false, message: "Server error while clearing SMS logs." });
  }
}

async function deleteAuditLog(req, res) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `
      DELETE FROM audit_logs
      WHERE id = ?
      `,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Audit log not found." });
    }

    return res.json({ success: true, message: "Audit log deleted successfully." });
  } catch (error) {
    console.error("Delete audit log error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting audit log." });
  }
}

async function clearAuditLogs(req, res) {
  try {
    await pool.query("DELETE FROM audit_logs");
    return res.json({ success: true, message: "Audit history cleared successfully." });
  } catch (error) {
    console.error("Clear audit logs error:", error);
    return res.status(500).json({ success: false, message: "Server error while clearing audit logs." });
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  updateUserStatus,
  listAuditLogs,
  deleteAuditLog,
  clearAuditLogs,
  listSmsLogs,
  deleteSmsLog,
  clearSmsLogs,
  deleteUser,
  resetPassword,
  listParents,
  getParentOptions,
  getStudentOptions,
  createParent,
  updateParent,
  createStudent,
  deleteStudent,
  createStudentAccount,
  createParentAccount,
  linkParentToStudentAdmin,
  scanStudentMasterlist,
  bulkImport,
  bulkDeleteStudents,
  linkExistingUserToProfile
};
