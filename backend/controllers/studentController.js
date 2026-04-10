const pool = require("../config/db");
const { getActorContext } = require("./caseController");
const {
  validateEmail,
  generateQrDataUrl,
  getStudentRecord,
  getParentRecord,
  createUserRecord,
  createStudentRecord,
  linkParentStudent,
  normalizeStatus
} = require("../utils/identityService");

function buildAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return null;
  }

  if (/^https?:\/\//i.test(avatarPath)) {
    return avatarPath;
  }

  return `http://localhost:${process.env.PORT || 5000}${avatarPath}`;
}

function getPageMeta(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

async function getAllStudents(req, res) {
  try {
    const { page, limit, offset } = getPageMeta(req);
    const params = [];
    let whereClause = "";

    if (req.query.search) {
      whereClause = `
        WHERE (
          s.student_number LIKE ?
          OR COALESCE(u.first_name, s.first_name) LIKE ?
          OR COALESCE(u.last_name, s.last_name) LIKE ?
          OR COALESCE(u.email, s.email) LIKE ?
        )
      `;
      const pattern = `%${req.query.search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (req.query.status) {
      whereClause += whereClause ? " AND COALESCE(u.status, s.record_status) = ?" : " WHERE COALESCE(u.status, s.record_status) = ?";
      params.push(req.query.status);
    }

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      `,
      params
    );

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.student_number,
        s.first_name AS profile_first_name,
        s.middle_name AS profile_middle_name,
        s.last_name AS profile_last_name,
        s.email AS profile_email,
        s.department,
        s.program,
        s.year_level,
        s.section,
        s.academic_level,
        s.qr_token,
        s.record_status,
        u.username,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.email,
        u.status,
        u.avatar_path
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const students = await Promise.all(rows.map(async row => ({
      ...row,
      first_name: row.first_name || row.profile_first_name,
      middle_name: row.middle_name || row.profile_middle_name,
      last_name: row.last_name || row.profile_last_name,
      email: row.email || row.profile_email,
      status: row.status || row.record_status,
      has_account: Boolean(row.user_id),
      qr_code_data_url: row.qr_token ? await generateQrDataUrl(row.student_number, row.qr_token) : null,
      avatar_url: buildAvatarUrl(row.avatar_path)
    })));

    return res.json({
      success: true,
      students,
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(1, Math.ceil(countRows[0].total / limit))
      }
    });
  } catch (error) {
    console.error("Get students error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function lookupStudentForReporting(req, res) {
  try {
    const studentNumber = req.query.studentNumber ? String(req.query.studentNumber).trim() : "";
    const qrToken = req.query.qrToken ? String(req.query.qrToken).trim() : "";

    if (!studentNumber && !qrToken) {
      return res.status(400).json({
        success: false,
        message: "Student number or QR token is required."
      });
    }

    const params = [];
    let whereClause = "";

    if (studentNumber && qrToken) {
      whereClause = "WHERE s.student_number = ? AND s.qr_token = ?";
      params.push(studentNumber, qrToken);
    } else if (studentNumber) {
      whereClause = "WHERE s.student_number = ?";
      params.push(studentNumber);
    } else {
      whereClause = "WHERE s.qr_token = ?";
      params.push(qrToken);
    }

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.student_number,
        s.department,
        s.program,
        s.year_level,
        s.section,
        s.academic_level,
        s.qr_token,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.middle_name, s.middle_name) AS middle_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        COALESCE(u.email, s.email) AS email,
        COALESCE(u.status, s.record_status) AS status
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      LIMIT 1
      `,
      params
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found for the provided student number or QR code."
      });
    }

    const student = rows[0];
    return res.json({
      success: true,
      student: {
        ...student,
        full_name: [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ")
      }
    });
  } catch (error) {
    console.error("Lookup student for reporting error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getStudentProfileById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.student_number,
        s.department,
        s.program,
        s.year_level,
        s.section,
        s.academic_level,
        s.qr_token,
        s.record_status,
        s.first_name AS profile_first_name,
        s.middle_name AS profile_middle_name,
        s.last_name AS profile_last_name,
        s.email AS profile_email,
        u.username,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.email,
        u.status,
        u.avatar_path
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const baseStudent = rows[0];
    const student = {
      ...baseStudent,
      first_name: baseStudent.first_name || baseStudent.profile_first_name,
      middle_name: baseStudent.middle_name || baseStudent.profile_middle_name,
      last_name: baseStudent.last_name || baseStudent.profile_last_name,
      email: baseStudent.email || baseStudent.profile_email,
      status: baseStudent.status || baseStudent.record_status,
      has_account: Boolean(baseStudent.user_id),
      qr_code_data_url: baseStudent.qr_token ? await generateQrDataUrl(baseStudent.student_number, baseStudent.qr_token) : null,
      avatar_url: buildAvatarUrl(baseStudent.avatar_path)
    };

    const [parents] = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        COALESCE(up.first_name, p.first_name) AS first_name,
        COALESCE(up.last_name, p.last_name) AS last_name,
        COALESCE(up.email, p.email) AS email,
        COALESCE(up.status, p.record_status) AS status,
        p.phone_number,
        p.address,
        sp.relationship
      FROM student_parents sp
      JOIN parents p ON sp.parent_id = p.id
      LEFT JOIN users up ON p.user_id = up.id
      WHERE sp.student_id = ?
      ORDER BY COALESCE(up.last_name, p.last_name), COALESCE(up.first_name, p.first_name)
      `,
      [id]
    );

    const [recentCases] = await pool.query(
      `
      SELECT
        id,
        case_number,
        violation_type,
        severity_level,
        status,
        incident_date
      FROM cases
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [id]
    );

    const [sanctions] = await pool.query(
      `
      SELECT
        id,
        sanction_type,
        status,
        start_date,
        end_date,
        created_at
      FROM sanctions
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [id]
    );

    const [hearings] = await pool.query(
      `
      SELECT
        h.id,
        h.scheduled_date,
        h.scheduled_time,
        h.location,
        h.status,
        c.case_number,
        c.violation_type
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE c.student_id = ?
      ORDER BY h.scheduled_date DESC, h.scheduled_time DESC
      LIMIT 10
      `,
      [id]
    );

    const [appeals] = await pool.query(
      `
      SELECT
        a.id,
        a.reason,
        a.status,
        a.decision_notes,
        a.created_at,
        c.case_number
      FROM appeals a
      JOIN cases c ON a.case_id = c.id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
      LIMIT 10
      `,
      [id]
    );

    return res.json({
      success: true,
      student,
      parents,
      recentCases,
      sanctions,
      hearings,
      appeals
    });
  } catch (error) {
    console.error("Get student profile error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getMyStudentProfile(req, res) {
  try {
    const context = await getActorContext(req.user);

    if (!context.studentId) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    req.params.id = String(context.studentId);
    return getStudentProfileById(req, res);
  } catch (error) {
    console.error("Get my student profile error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getLinkedChildrenOverview(req, res) {
  try {
    const [parentRows] = await pool.query(
      `
      SELECT
        p.id,
        COALESCE(u.first_name, p.first_name) AS first_name,
        COALESCE(u.middle_name, p.middle_name) AS middle_name,
        COALESCE(u.last_name, p.last_name) AS last_name,
        COALESCE(u.email, p.email) AS email,
        p.phone_number,
        p.address,
        COALESCE(u.status, p.record_status) AS status
      FROM parents p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (!parentRows.length) {
      return res.status(404).json({ success: false, message: "Parent profile not found." });
    }

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.student_number,
        s.program,
        s.year_level,
        s.section,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        COUNT(DISTINCT c.id) AS total_cases,
        COUNT(DISTINCT h.id) AS total_hearings,
        COUNT(DISTINCT sc.id) AS total_sanctions
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN cases c ON c.student_id = s.id
      LEFT JOIN hearings h ON h.case_id = c.id
      LEFT JOIN sanctions sc ON sc.student_id = s.id
      WHERE sp.parent_id = ?
      GROUP BY
        s.id,
        s.student_number,
        s.program,
        s.year_level,
        s.section,
        COALESCE(u.first_name, s.first_name),
        COALESCE(u.last_name, s.last_name)
      ORDER BY COALESCE(u.last_name, s.last_name), COALESCE(u.first_name, s.first_name)
      `,
      [parentRows[0].id]
    );

    return res.json({
      success: true,
      parent: {
        id: parentRows[0].id,
        first_name: parentRows[0].first_name,
        middle_name: parentRows[0].middle_name,
        last_name: parentRows[0].last_name,
        email: parentRows[0].email,
        phone_number: parentRows[0].phone_number,
        address: parentRows[0].address,
        status: parentRows[0].status
      },
      children: rows
    });
  } catch (error) {
    console.error("Get linked children overview error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function updateStudentProfile(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const {
      firstName,
      middleName,
      lastName,
      email,
      department,
      program,
      yearLevel,
      section,
      academicLevel,
      status
    } = req.body;

    const student = await getStudentRecord(connection, id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    if ((email || student.email) && email && !validateEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE students
      SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        email = ?,
        department = ?,
        program = ?,
        year_level = ?,
        section = ?,
        academic_level = ?,
        record_status = ?
      WHERE id = ?
      `,
      [
        firstName ? firstName.trim() : student.first_name,
        middleName !== undefined ? (middleName ? middleName.trim() : null) : student.middle_name,
        lastName ? lastName.trim() : student.last_name,
        email !== undefined ? (email ? email.trim() : null) : student.email,
        department !== undefined ? (department ? department.trim() : null) : student.department,
        program !== undefined ? (program ? program.trim() : null) : student.program,
        yearLevel !== undefined ? (yearLevel ? yearLevel.trim() : null) : student.year_level,
        section !== undefined ? (section ? section.trim() : null) : student.section,
        academicLevel || student.academic_level,
        normalizeStatus(status || student.record_status),
        id
      ]
    );

    if (student.user_id) {
      await connection.query(
        `
        UPDATE users
        SET
          employee_or_student_id = ?,
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          email = ?,
          status = ?
        WHERE id = ?
        `,
        [
          student.student_number,
          firstName ? firstName.trim() : student.first_name,
          middleName !== undefined ? (middleName ? middleName.trim() : null) : student.middle_name,
          lastName ? lastName.trim() : student.last_name,
          email !== undefined ? (email ? email.trim() : null) : student.email,
          normalizeStatus(status || student.record_status),
          student.user_id
        ]
      );
    }

    await connection.commit();

    return res.json({ success: true, message: "Student profile updated successfully." });
  } catch (error) {
    await connection.rollback();
    console.error("Update student profile error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  } finally {
    connection.release();
  }
}

async function createStudent(req, res) {
  const connection = await pool.getConnection();

  try {
    const {
      studentNumber,
      username,
      email,
      password,
      firstName,
      middleName,
      lastName,
      department,
      program,
      yearLevel,
      section,
      academicLevel,
      parentId
    } = req.body;

    await connection.beginTransaction();

    const userId = await createUserRecord(connection, {
      employeeOrStudentId: studentNumber,
      username,
      email,
      password,
      firstName,
      middleName,
      lastName,
      role: "student",
      status: "active"
    });

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
      recordStatus: "active"
    });

    if (parentId) {
      const parent = await getParentRecord(connection, parentId);
      if (!parent) {
        throw new Error("Parent record not found.");
      }
      await linkParentStudent(connection, createdStudent.id, parentId, "Parent/Guardian");
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Student created successfully."
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create student error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Server error while creating student."
    });
  } finally {
    connection.release();
  }
}

async function deactivateStudent(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT user_id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    if (rows[0].user_id) {
      await pool.query(`UPDATE users SET status = 'inactive' WHERE id = ?`, [rows[0].user_id]);
    }

    await pool.query(`UPDATE students SET record_status = 'inactive' WHERE id = ?`, [id]);

    return res.json({ success: true, message: "Student deactivated successfully." });
  } catch (error) {
    console.error("Deactivate student error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    console.error("Get parent options error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function linkParentToStudent(req, res) {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { parentId, relationship } = req.body;

    if (!parentId) {
      return res.status(400).json({ success: false, message: "Parent is required." });
    }

    const student = await getStudentRecord(connection, id);
    const parent = await getParentRecord(connection, parentId);

      if (!student || !parent) {
        return res.status(404).json({ success: false, message: "Student or parent not found." });
      }

      if (!parent.phone_number || !String(parent.phone_number).trim()) {
        return res.status(400).json({ success: false, message: "Parent phone number is required before linking for SMS notifications." });
      }

      await linkParentStudent(connection, id, parentId, relationship || "Parent/Guardian");

    return res.json({ success: true, message: "Parent linked successfully." });
  } catch (error) {
    console.error("Link parent error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Server error"
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllStudents,
  lookupStudentForReporting,
  getStudentProfileById,
  getMyStudentProfile,
  getLinkedChildrenOverview,
  updateStudentProfile,
  createStudent,
  deactivateStudent,
  getParentOptions,
  linkParentToStudent
};
