const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const {
  ALLOWED_ROLES,
  normalizeRole,
  normalizeStatus,
  validateEmail,
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
} = require("../utils/identityService");

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
      createAccount,
      username,
      password,
      parentLinkMode,
      existingParentId,
      relationship,
      newParent
    } = req.body;

    await connection.beginTransaction();

    let userId = null;

    if (createAccount) {
      userId = await createUserRecord(connection, {
        employeeOrStudentId: studentNumber,
        username,
        email,
        password,
        firstName,
        middleName,
        lastName,
        role: "student",
        status
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

    if (parentLinkMode === "existing" && existingParentId) {
      await linkParentStudent(connection, createdStudent.id, existingParentId, relationship);
    }

    if (parentLinkMode === "new" && newParent) {
      let parentUserId = null;

      if (newParent.createAccount) {
        parentUserId = await createUserRecord(connection, {
          employeeOrStudentId: null,
          username: newParent.username,
          email: newParent.email,
          password: newParent.password,
          firstName: newParent.firstName,
          middleName: newParent.middleName,
          lastName: newParent.lastName,
          role: "parent",
          status
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

      await linkParentStudent(connection, createdStudent.id, parentId, relationship || "Parent/Guardian");
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Student record created successfully.",
      studentId: createdStudent.id,
      qrToken: createdStudent.qrToken,
      qrCodeDataUrl: await generateQrDataUrl(studentNumber, createdStudent.qrToken)
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

async function bulkImport(req, res) {
  const connection = await pool.getConnection();

  try {
    const { importType, createLoginAccounts, rows } = req.body;

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ success: false, message: "Import rows are required." });
    }

    const summary = {
      importType,
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: []
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;

      try {
        await connection.beginTransaction();

        if (importType === "students") {
          let userId = null;
          if (createLoginAccounts) {
            userId = await createUserRecord(connection, {
              employeeOrStudentId: row.studentNumber,
              username: row.username,
              email: row.email,
              password: row.password || generateTemporaryPassword(),
              firstName: row.firstName,
              middleName: row.middleName,
              lastName: row.lastName,
              role: "student",
              status: row.status || "active"
            });
          }

          await createStudentRecord(connection, {
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

module.exports = {
  listUsers,
  createUser,
  updateUser,
  updateUserStatus,
  listAuditLogs,
  deleteUser,
  resetPassword,
  listParents,
  getParentOptions,
  getStudentOptions,
  createParent,
  updateParent,
  createStudent,
  createStudentAccount,
  createParentAccount,
  linkParentToStudentAdmin,
  bulkImport,
  linkExistingUserToProfile
};
