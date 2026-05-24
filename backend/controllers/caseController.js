const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { sendSms, isSmsEnabled } = require("../utils/smsService");
const { generateQrDataUrl } = require("../utils/identityService");

async function createNotification(userId, title, message, type = "system") {
  await pool.query(
    `
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, ?, ?, ?)
    `,
    [userId, title, message, type]
  );
}

function buildAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return "";
  }

  if (/^https?:\/\//i.test(avatarPath)) {
    return avatarPath;
  }

  return `http://localhost:${process.env.PORT || 5000}${avatarPath}`;
}

async function notifyLinkedParentsAboutCase({
  caseId,
  caseNumber,
  student,
  violation,
  incidentDate,
  location
}) {
  const [parentRows] = await pool.query(
    `
    SELECT
      p.id AS parent_id,
      p.phone_number,
      p.first_name AS profile_first_name,
      p.last_name AS profile_last_name,
      pu.id AS parent_user_id,
      pu.first_name AS account_first_name,
      pu.last_name AS account_last_name
    FROM student_parents sp
    JOIN parents p ON sp.parent_id = p.id
    LEFT JOIN users pu ON p.user_id = pu.id
    WHERE sp.student_id = ?
    `,
    [student.student_id]
  );

  if (!parentRows.length) {
    return {
      notifiedParents: 0,
      smsSentCount: 0,
      smsEnabled: isSmsEnabled()
    };
  }

  const studentName = `${student.first_name} ${student.last_name}`.trim();
  let notifiedParents = 0;
  let smsSentCount = 0;

  for (const parent of parentRows) {
    const parentName = `${parent.account_first_name || parent.profile_first_name || "Parent"} ${parent.account_last_name || parent.profile_last_name || ""}`.trim();
      const smsMessage =
      `Philtech-GMA Disciplinary Alert: A new case (${caseNumber}) was reported for ${studentName} regarding ${violation} on ${incidentDate}.`
        + `${location ? ` Location: ${location}.` : ""} Please check the system or contact the school office for details.`;

    if (parent.parent_user_id) {
      await createNotification(
        parent.parent_user_id,
        "New Case Report for Linked Student",
        `A disciplinary case (${caseNumber}) was reported for ${studentName}.`,
        "sms"
      );
      notifiedParents += 1;
    }

    const smsResult = await sendSms({
      caseId,
      parentId: parent.parent_id,
      phoneNumber: parent.phone_number,
      message: `Dear ${parentName}, ${smsMessage}`
    });

    if (smsResult.success) {
      smsSentCount += 1;
    }
  }

  return {
    notifiedParents,
    smsSentCount,
    smsEnabled: isSmsEnabled()
  };
}

function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function buildCaseFilterClause(query, params, user = null) {
  let clause = "";

  if (query.search) {
    clause += `
      AND (
        c.case_number LIKE ?
        OR c.violation_type LIKE ?
        OR s.student_number LIKE ?
        OR COALESCE(u.first_name, s.first_name) LIKE ?
        OR COALESCE(u.last_name, s.last_name) LIKE ?
      )
    `;
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (query.status) {
    clause += " AND c.status = ?";
    params.push(query.status);
  } else if (query.activeOnly === "true") {
    clause += " AND c.status NOT IN ('resolved', 'dismissed')";
  }

  if (query.severity) {
    clause += " AND c.severity_level = ?";
    params.push(query.severity);
  }

  if (query.assigned === "unassigned") {
    clause += " AND c.assigned_to_user_id IS NULL";
  } else if (query.assigned === "mine" && user?.id) {
    clause += " AND c.assigned_to_user_id = ?";
    params.push(user.id);
  }

  return clause;
}

function formatRoleLabel(role = "") {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCaseClosed(status) {
  return ["resolved", "dismissed"].includes(String(status || "").toLowerCase());
}

async function getActorContext(user) {
  const context = {
    role: user.role,
    userId: user.id,
    studentId: null,
    parentId: null
  };

  if (user.role === "student") {
    const [studentRows] = await pool.query(
      `
      SELECT id, student_number
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [user.id]
    );

    if (studentRows.length) {
      context.studentId = studentRows[0].id;
      context.studentNumber = studentRows[0].student_number;
    }
  }

  if (user.role === "parent") {
    const [parentRows] = await pool.query(
      `
      SELECT id
      FROM parents
      WHERE user_id = ?
      LIMIT 1
      `,
      [user.id]
    );

    if (parentRows.length) {
      context.parentId = parentRows[0].id;
    }
  }

  return context;
}

function buildCaseAccessClause(context, { includeAssignedTeacher = true } = {}) {
  switch (context.role) {
    case "admin":
    case "discipline_officer":
    case "guidance_counselor":
      return {
        clause: "",
        params: []
      };
    case "teacher":
      return {
        clause: includeAssignedTeacher
          ? "AND (c.reported_by_user_id = ? OR c.assigned_to_user_id = ?)"
          : "AND c.reported_by_user_id = ?",
        params: includeAssignedTeacher ? [context.userId, context.userId] : [context.userId]
      };
    case "student":
      return {
        clause: "AND c.student_id = ?",
        params: [context.studentId || 0]
      };
    case "parent":
      return {
        clause: `
          AND EXISTS (
            SELECT 1
            FROM student_parents sp
            WHERE sp.student_id = c.student_id
              AND sp.parent_id = ?
          )
        `,
        params: [context.parentId || 0]
      };
    default:
      return {
        clause: "AND 1 = 0",
        params: []
      };
  }
}

async function getCaseForAccess(caseId, context) {
  const access = buildCaseAccessClause(context);
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.case_number,
      c.student_id,
      c.reported_by_user_id,
      c.assigned_to_user_id
    FROM cases c
    WHERE c.id = ?
    ${access.clause}
    LIMIT 1
    `,
    [caseId, ...access.params]
  );

  return rows[0] || null;
}

async function getCaseStatusRecord(caseId) {
  const [rows] = await pool.query(
    `
    SELECT id, case_number, status
    FROM cases
    WHERE id = ?
    LIMIT 1
    `,
    [caseId]
  );

  return rows[0] || null;
}

async function createCase(req, res) {
  try {
    const { studentNumber, violation, severity, date, location, description } = req.body;

    if (!studentNumber || !violation || !severity || !date || !description) {
      return res.status(400).json({
        success: false,
        message: "Student number, violation, severity, date, and description are required."
      });
    }

    const allowedSeverities = ["minor", "major", "grave"];
    if (!allowedSeverities.includes(severity)) {
      return res.status(400).json({
        success: false,
        message: "Severity must be minor, major, or grave."
      });
    }

    const [studentRows] = await pool.query(
  `
  SELECT 
    s.id AS student_id, 
    s.student_number, 
    s.user_id AS student_user_id,
    COALESCE(u.first_name, s.first_name) AS first_name, 
    COALESCE(u.last_name, s.last_name) AS last_name
  FROM students s
  LEFT JOIN users u ON s.user_id = u.id
  WHERE s.student_number = ?
  LIMIT 1
  `,
  [studentNumber]
);

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    const student = studentRows[0];

    const caseNumber = "CASE-" + Date.now();

    const [result] = await pool.query(
      `
      INSERT INTO cases
      (
        case_number,
        student_id,
        reported_by_user_id,
        violation_type,
        severity_level,
        incident_date,
        location,
        description,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        caseNumber,
        student.student_id,
        req.user.id,
        violation,
        severity,
        date,
        location || null,
        description
      ]
    );

    await logAudit({
      userId: req.user.id,
      action: "CREATE_CASE",
      targetTable: "cases",
      targetId: result.insertId,
      details: `Created case ${caseNumber} for student ${student.student_number}`,
      ipAddress: req.ip
    });

    if (student.student_user_id) {
      await createNotification(
        student.student_user_id,
        "New Disciplinary Case Recorded",
        `A disciplinary case (${caseNumber}) has been recorded for you regarding ${violation}.`,
        "case"
      );
    }

    let parentNotificationSummary = {
      notifiedParents: 0,
      smsSentCount: 0,
      smsEnabled: isSmsEnabled()
    };

    if (req.user.role === "teacher") {
      parentNotificationSummary = await notifyLinkedParentsAboutCase({
        caseId: result.insertId,
        caseNumber,
        student,
        violation,
        incidentDate: date,
        location
      });

      if (parentNotificationSummary.smsSentCount > 0 || parentNotificationSummary.notifiedParents > 0) {
        await pool.query(
          `
          UPDATE cases
          SET parent_notified = 1
          WHERE id = ?
          `,
          [result.insertId]
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Case created successfully.",
      case: {
        id: result.insertId,
        case_number: caseNumber,
        student_number: student.student_number,
        student_name: `${student.first_name} ${student.last_name}`,
        violation_type: violation,
        severity_level: severity,
        incident_date: date,
        location: location || null,
        description,
        status: "pending"
      },
      parent_notification: parentNotificationSummary
    });
  } catch (error) {
    console.error("Create case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating case."
    });
  }
}

async function getAllCases(req, res) {
  try {
    const context = await getActorContext(req.user);
    const access = buildCaseAccessClause(context);
    const { page, limit, offset } = parsePagination(req.query);
    const filterParams = [];
    const filterClause = buildCaseFilterClause(req.query, filterParams, req.user);

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1 = 1
      ${access.clause}
      ${filterClause}
      `,
      [...access.params, ...filterParams]
    );

    const [rows] = await pool.query(
      `
      SELECT 
        c.id,
        c.student_id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.incident_date,
        c.location,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        s.student_number,
        reporter.first_name AS reported_by_first_name,
        reporter.last_name AS reported_by_last_name,
        assignee.first_name AS assigned_to_first_name,
        assignee.last_name AS assigned_to_last_name,
        assignee.role AS assigned_to_role
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN users reporter ON c.reported_by_user_id = reporter.id
      LEFT JOIN users assignee ON c.assigned_to_user_id = assignee.id
      WHERE 1 = 1
      ${access.clause}
      ${filterClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...access.params, ...filterParams, limit, offset]
    );

    return res.json({
      success: true,
      cases: rows.map(item => ({
        ...item,
        assigned_to_role_label: formatRoleLabel(item.assigned_to_role)
      })),
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.max(1, Math.ceil(countRows[0].total / limit))
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error fetching cases"
    });
  }
}

async function getCaseById(req, res) {
  try {
    const { id } = req.params;
    const context = await getActorContext(req.user);
    const allowedCase = await getCaseForAccess(id, context);

    if (!allowedCase) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT 
        c.id,
        c.student_id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.incident_date,
        c.incident_time,
        c.location,
        c.description,
        c.hearing_required,
        c.parent_notified,
        c.reported_by_user_id,
        c.assigned_to_user_id,
        s.student_number,
        s.department,
        s.program,
        s.year_level,
        s.section,
        s.academic_level,
        s.qr_token,
        u.avatar_path AS student_avatar_path,
          COALESCE(u.first_name, s.first_name) AS first_name,
          COALESCE(u.middle_name, s.middle_name) AS middle_name,
          COALESCE(u.last_name, s.last_name) AS last_name,
          reporter.first_name AS reported_by_first_name,
          reporter.last_name AS reported_by_last_name,
          reporter.role AS reported_by_role,
          assignee.first_name AS assigned_to_first_name,
          assignee.last_name AS assigned_to_last_name,
          assignee.role AS assigned_to_role
        FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN users reporter ON c.reported_by_user_id = reporter.id
      LEFT JOIN users assignee ON c.assigned_to_user_id = assignee.id
      WHERE c.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

      const studentQrCodeDataUrl = rows[0].qr_token
        ? await generateQrDataUrl(rows[0].student_number, rows[0].qr_token)
        : "";

      const caseData = {
        ...rows[0],
        student_avatar_url: buildAvatarUrl(rows[0].student_avatar_path),
        student_qr_code_data_url: studentQrCodeDataUrl,
        reported_by_role_label: formatRoleLabel(rows[0].reported_by_role),
        assigned_to_role_label: formatRoleLabel(rows[0].assigned_to_role),
        is_closed: isCaseClosed(rows[0].status)
      };

    const [updates] = await pool.query(
      `
      SELECT
        cu.id,
        cu.update_type,
        cu.content,
        cu.created_at,
        u.first_name,
        u.last_name,
        u.role
      FROM case_updates cu
      JOIN users u ON cu.updated_by_user_id = u.id
      WHERE cu.case_id = ?
      ORDER BY cu.created_at DESC
      `,
      [id]
    );

    const [evidence] = await pool.query(
      `
      SELECT
        ce.id,
        ce.file_name,
        ce.file_path,
        ce.file_type,
        ce.uploaded_at,
        ce.original_name,
        ce.file_size,
        ce.review_status,
          ce.review_notes,
          ce.reviewed_at,
          uploader.first_name AS uploaded_by_first_name,
          uploader.last_name AS uploaded_by_last_name,
          uploader.role AS uploaded_by_role,
          reviewer.first_name AS reviewed_by_first_name,
          reviewer.last_name AS reviewed_by_last_name,
          reviewer.role AS reviewed_by_role
        FROM case_evidence ce
        JOIN users uploader ON ce.uploaded_by_user_id = uploader.id
        LEFT JOIN users reviewer ON ce.reviewed_by_user_id = reviewer.id
        WHERE ce.case_id = ?
      ORDER BY ce.uploaded_at DESC
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
          h.outcome,
          h.status,
          h.created_at,
          creator.first_name AS created_by_first_name,
          creator.last_name AS created_by_last_name,
          creator.role AS created_by_role
        FROM hearings h
        JOIN users creator ON h.created_by_user_id = creator.id
        WHERE h.case_id = ?
        ORDER BY scheduled_date DESC, scheduled_time DESC
        `,
        [id]
      );

      const [sanctions] = await pool.query(
        `
        SELECT
          s.id,
          s.sanction_type,
          s.description,
          s.start_date,
          s.end_date,
          s.status,
          s.created_at,
          assigner.first_name AS assigned_by_first_name,
          assigner.last_name AS assigned_by_last_name,
          assigner.role AS assigned_by_role
        FROM sanctions s
        JOIN users assigner ON s.assigned_by_user_id = assigner.id
        WHERE s.case_id = ?
        ORDER BY created_at DESC
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
        a.reviewed_at,
          a.created_at,
          submitter.first_name AS submitted_by_first_name,
          submitter.last_name AS submitted_by_last_name,
          submitter.role AS submitted_by_role,
          reviewer.first_name AS reviewed_by_first_name,
          reviewer.last_name AS reviewed_by_last_name,
          reviewer.role AS reviewed_by_role
        FROM appeals a
      JOIN users submitter ON a.submitted_by_user_id = submitter.id
      LEFT JOIN users reviewer ON a.reviewed_by_user_id = reviewer.id
      WHERE a.case_id = ?
      ORDER BY a.created_at DESC
      `,
      [id]
    );

    let counselorNotes = [];
    if (["admin", "discipline_officer", "guidance_counselor"].includes(req.user.role)) {
      const [noteRows] = await pool.query(
        `
        SELECT
          ci.id,
          ci.note_type,
          ci.note,
          ci.status,
            ci.follow_up_date,
            ci.created_at,
            u.first_name,
            u.last_name,
            u.role
          FROM counselor_interventions ci
        JOIN users u ON ci.counselor_user_id = u.id
        WHERE ci.case_id = ?
        ORDER BY ci.created_at DESC
        `,
        [id]
      );
      counselorNotes = noteRows;
    }

      return res.json({
        success: true,
        case: caseData,
        timeline: {
          updates: updates.map(item => ({ ...item, role_label: formatRoleLabel(item.role) })),
          evidence: evidence.map(item => ({
            ...item,
            uploaded_by_role_label: formatRoleLabel(item.uploaded_by_role),
            reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
          })),
          hearings: hearings.map(item => ({
            ...item,
            created_by_role_label: formatRoleLabel(item.created_by_role)
          })),
          sanctions: sanctions.map(item => ({
            ...item,
            assigned_by_role_label: formatRoleLabel(item.assigned_by_role)
          })),
          appeals: appeals.map(item => ({
            ...item,
            submitted_by_role_label: formatRoleLabel(item.submitted_by_role),
            reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
          })),
          counselorNotes: counselorNotes.map(item => ({
            ...item,
            role_label: formatRoleLabel(item.role)
          }))
        }
      });
  } catch (error) {
    console.error("Get case by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching case details."
    });
  }
}

async function addCaseUpdate(req, res) {
  try {
    const { id } = req.params;
    const { updateType, content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Update content is required."
      });
    }

    const allowedTypes = [
      "note",
      "investigation",
      "witness_statement",
      "status_change",
      "hearing_note",
      "other"
    ];

    const finalType = allowedTypes.includes(updateType) ? updateType : "note";

    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(id, context);

      if (!caseItem) {
        return res.status(404).json({
          success: false,
          message: "Case not found."
        });
      }

      const caseStatus = await getCaseStatusRecord(id);
      if (caseStatus && isCaseClosed(caseStatus.status)) {
        return res.status(400).json({
          success: false,
          message: "Resolved or dismissed cases are read-only."
        });
      }

    const [result] = await pool.query(
      `
      INSERT INTO case_updates
      (case_id, updated_by_user_id, update_type, content)
      VALUES (?, ?, ?, ?)
      `,
      [id, req.user.id, finalType, content]
    );

    await logAudit({
      userId: req.user.id,
      action: "ADD_CASE_UPDATE",
      targetTable: "case_updates",
      targetId: result.insertId,
      details: `Added ${finalType} update to ${caseItem.case_number}`,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: "Case update added successfully."
    });
  } catch (error) {
    console.error("Add case update error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while adding case update."
    });
  }
}

async function getCaseUpdates(req, res) {
  try {
    const { id } = req.params;
    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(id, context);

    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT 
        cu.id,
        cu.case_id,
        cu.update_type,
        cu.content,
        cu.created_at,
        u.first_name,
        u.last_name,
        u.role
      FROM case_updates cu
      JOIN users u ON cu.updated_by_user_id = u.id
      WHERE cu.case_id = ?
      ORDER BY cu.created_at DESC
      `,
      [id]
    );

    return res.json({
      success: true,
      updates: rows
    });
  } catch (error) {
    console.error("Get case updates error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching case updates."
    });
  }
}

async function updateCaseStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "under_investigation",
      "hearing_scheduled",
      "dismissed",
      "resolved"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status."
      });
    }

    const [caseRows] = await pool.query(
      `SELECT id, case_number, status FROM cases WHERE id = ? LIMIT 1`,
      [id]
    );

    if (caseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const currentStatus = caseRows[0].status;
    const reopeningClosedCase = isCaseClosed(currentStatus) && !isCaseClosed(status);

    if (isCaseClosed(currentStatus) && !reopeningClosedCase) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    if (reopeningClosedCase && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can reopen resolved or dismissed cases."
      });
    }

    await pool.query(
      `UPDATE cases SET status = ? WHERE id = ?`,
      [status, id]
    );

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_CASE_STATUS",
      targetTable: "cases",
      targetId: Number(id),
      details: `Updated case ${caseRows[0].case_number} status to ${status}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: reopeningClosedCase
        ? "Case reopened successfully."
        : "Case status updated successfully."
    });
  } catch (error) {
    console.error("Update case status error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating case status."
    });
  }
}

async function assignCase(req, res) {
  try {
    const { id } = req.params;
    const { assignedToUserId } = req.body;

    if (!assignedToUserId) {
      return res.status(400).json({
        success: false,
        message: "Assigned user is required."
      });
    }

    const [userRows] = await pool.query(
      `
      SELECT id, first_name, last_name, role
      FROM users
      WHERE id = ? AND role IN ('discipline_officer', 'guidance_counselor')
      LIMIT 1
      `,
      [assignedToUserId]
    );

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        message: "Assignable user not found."
      });
    }

      const [caseRows] = await pool.query(
        `SELECT id, case_number, status FROM cases WHERE id = ? LIMIT 1`,
        [id]
      );

      if (!caseRows.length) {
        return res.status(404).json({
          success: false,
          message: "Case not found."
        });
      }

      if (isCaseClosed(caseRows[0].status)) {
        return res.status(400).json({
          success: false,
          message: "Resolved or dismissed cases are read-only."
        });
      }

    const assignee = userRows[0];

    await pool.query(
      `
      UPDATE cases
      SET assigned_to_user_id = ?
      WHERE id = ?
      `,
      [assignedToUserId, id]
    );

    if (Number(assignee.id) !== Number(req.user.id)) {
      await createNotification(
        assignee.id,
        "Case Assignment",
        `You have been assigned to handle case ${caseRows[0].case_number}.`,
        "case"
      );
    }

    await logAudit({
      userId: req.user.id,
      action: "ASSIGN_CASE",
      targetTable: "cases",
      targetId: Number(id),
      details: `Assigned ${caseRows[0].case_number} to ${assignee.first_name} ${assignee.last_name} (${assignee.role})`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Case assigned successfully."
    });
  } catch (error) {
    console.error("Assign case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while assigning case."
    });
  }
}

async function claimCase(req, res) {
  try {
    const { id } = req.params;

    if (req.user.role !== "discipline_officer") {
      return res.status(403).json({
        success: false,
        message: "Only discipline officers can claim cases."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.status,
        c.assigned_to_user_id,
        c.reported_by_user_id,
        c.violation_type,
        s.student_number,
        COALESCE(su.first_name, s.first_name) AS first_name,
        COALESCE(su.last_name, s.last_name) AS last_name
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users su ON s.user_id = su.id
      WHERE c.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!caseRows.length) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const caseItem = caseRows[0];
    const [actorRows] = await pool.query(
      `
      SELECT id, first_name, last_name
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );
    const actor = actorRows[0] || {
      id: req.user.id,
      first_name: req.user.username || "Discipline",
      last_name: "Officer"
    };

    if (isCaseClosed(caseItem.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    if (caseItem.assigned_to_user_id && Number(caseItem.assigned_to_user_id) !== Number(req.user.id)) {
      return res.status(409).json({
        success: false,
        message: "This case has already been assigned to another staff member."
      });
    }

    if (Number(caseItem.assigned_to_user_id) === Number(req.user.id)) {
      return res.json({
        success: true,
        message: "You are already handling this case.",
        case: {
          id: caseItem.id,
          case_number: caseItem.case_number,
          status: caseItem.status,
          assigned_to_user_id: req.user.id
        }
      });
    }

    await pool.query(
      `
      UPDATE cases
      SET assigned_to_user_id = ?, status = 'under_investigation'
      WHERE id = ? AND assigned_to_user_id IS NULL
      `,
      [req.user.id, id]
    );

    await pool.query(
      `
      INSERT INTO case_updates (case_id, updated_by_user_id, update_type, content)
      VALUES (?, ?, 'investigation', ?)
      `,
      [
        id,
        req.user.id,
        `Case claimed by ${actor.first_name} ${actor.last_name} for investigation.`
      ]
    );

    await logAudit({
      userId: req.user.id,
      action: "CLAIM_CASE",
        targetTable: "cases",
        targetId: Number(id),
        details: `Claimed ${caseItem.case_number} for investigation`,
      ipAddress: req.ip
    });

    const [adminAndGuidanceRows] = await pool.query(
      `
      SELECT id, role
      FROM users
      WHERE status = 'active'
        AND role IN ('admin', 'guidance_counselor')
        AND id <> ?
      `,
      [req.user.id]
    );

    const notificationTargets = new Set(adminAndGuidanceRows.map(item => item.id));
    if (caseItem.reported_by_user_id && Number(caseItem.reported_by_user_id) !== Number(req.user.id)) {
      notificationTargets.add(caseItem.reported_by_user_id);
    }

    for (const targetUserId of notificationTargets) {
      await createNotification(
        targetUserId,
        "Case Claimed for Investigation",
        `${actor.first_name} ${actor.last_name} claimed ${caseItem.case_number} for ${caseItem.first_name} ${caseItem.last_name}.`,
        "case"
      );
    }

    return res.json({
      success: true,
      message: "Case claimed successfully.",
      case: {
        id: caseItem.id,
        case_number: caseItem.case_number,
        status: "under_investigation",
        assigned_to_user_id: req.user.id
      }
    });
  } catch (error) {
    console.error("Claim case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while claiming case."
    });
  }
}

async function getCaseSummary(req, res) {
  try {
    const context = await getActorContext(req.user);
    const access = buildCaseAccessClause(context);

    const [statusRows] = await pool.query(
      `
      SELECT c.status, COUNT(*) AS total
      FROM cases c
      WHERE 1 = 1
      ${access.clause}
      GROUP BY c.status
      `,
      access.params
    );

    const [severityRows] = await pool.query(
      `
      SELECT c.severity_level, COUNT(*) AS total
      FROM cases c
      WHERE 1 = 1
      ${access.clause}
      GROUP BY c.severity_level
      `,
      access.params
    );

      const [totalRows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM cases c
        WHERE 1 = 1
        ${access.clause}
        `,
        access.params
      );

      const [activeRows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM cases c
        WHERE 1 = 1
        ${access.clause}
        AND c.status NOT IN ('resolved', 'dismissed')
        `,
        access.params
      );

      return res.json({
        success: true,
        totalCases: totalRows[0].total,
        activeCaseQueue: activeRows[0].total,
        byStatus: statusRows,
        bySeverity: severityRows
      });
  } catch (error) {
    console.error("Get case summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching case summary."
    });
  }
}

async function getMyStudentCases(req, res) {
  try {
    const context = await getActorContext(req.user);
    const studentRows = context.studentId
      ? [{ id: context.studentId, student_number: context.studentNumber }]
      : [];

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }

    const student = studentRows[0];

    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.incident_date,
        c.location,
        c.description
      FROM cases c
      WHERE c.student_id = ?
      ORDER BY c.created_at DESC
      `,
      [student.id]
    );

    return res.json({
      success: true,
      student_number: student.student_number,
      cases: rows
    });
  } catch (error) {
    console.error("Get my student cases error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching student cases."
    });
  }
}

async function getParentChildCases(req, res) {
  try {
    const context = await getActorContext(req.user);
    const parentRows = context.parentId ? [{ id: context.parentId }] : [];

    if (parentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Parent profile not found."
      });
    }

    const parentId = parentRows[0].id;

    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.incident_date,
        c.location,
        c.description,
        s.student_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN cases c ON c.student_id = s.id
      WHERE sp.parent_id = ?
      ORDER BY c.created_at DESC
      `,
      [parentId]
    );

    return res.json({
      success: true,
      cases: rows
    });
  } catch (error) {
    console.error("Get parent child cases error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching child cases."
    });
  }
}

module.exports = {
  createCase,
  getAllCases,
  getCaseById,
  addCaseUpdate,
  getCaseUpdates,
  updateCaseStatus,
  assignCase,
  claimCase,
  getCaseSummary,
  getMyStudentCases,
  getParentChildCases,
  getActorContext,
  getCaseForAccess,
  getCaseStatusRecord,
  isCaseClosed
};
