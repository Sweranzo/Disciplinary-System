const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { sendSms } = require("../utils/smsService");
const { getActorContext, getCaseForAccess, getCaseStatusRecord, isCaseClosed } = require("./caseController");

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeSanctionStatus(status) {
  const value = String(status || "active").toLowerCase();

  if (["fulfilled", "completed", "resolved"].includes(value)) {
    return "fulfilled";
  }

  if (value === "cancelled") {
    return "cancelled";
  }

  return "active";
}

function formatRoleLabel(role = "") {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function createNotification(userId, title, message, type = "system") {
  await pool.query(
    `
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, ?, ?, ?)
    `,
    [userId, title, message, type]
  );
}

async function notifySanctionStakeholders({
  caseId,
  parentTitle,
  parentMessage,
  studentTitle,
  studentMessage,
  smsMessage
}) {
  const notifiedStudentUsers = new Set();
  const notifiedParentUsers = new Set();
  const [recipientRows] = await pool.query(
    `
    SELECT
      su.id AS student_user_id,
      p.id AS parent_id,
      p.phone_number,
      pu.id AS parent_user_id,
      COALESCE(pu.first_name, p.first_name) AS parent_first_name,
      COALESCE(pu.last_name, p.last_name) AS parent_last_name
    FROM cases c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN users su ON s.user_id = su.id
    LEFT JOIN student_parents sp ON sp.student_id = s.id
    LEFT JOIN parents p ON sp.parent_id = p.id
    LEFT JOIN users pu ON p.user_id = pu.id
    WHERE c.id = ?
    `,
    [caseId]
  );

  for (const row of recipientRows) {
    if (row.student_user_id && !notifiedStudentUsers.has(row.student_user_id) && studentTitle && studentMessage) {
      await createNotification(row.student_user_id, studentTitle, studentMessage, "sanction");
      notifiedStudentUsers.add(row.student_user_id);
    }

    if (row.parent_user_id && !notifiedParentUsers.has(row.parent_user_id) && parentTitle && parentMessage) {
      await createNotification(row.parent_user_id, parentTitle, parentMessage, "sanction");
      notifiedParentUsers.add(row.parent_user_id);
    }

    if (row.parent_id && row.phone_number && smsMessage) {
      const parentName = `${row.parent_first_name || "Parent"} ${row.parent_last_name || ""}`.trim();
      await sendSms({
        caseId,
        parentId: row.parent_id,
        phoneNumber: row.phone_number,
        message: `Dear ${parentName}, ${smsMessage}`
      });
    }
  }
}

function decorateSanction(record) {
  const normalizedStatus = normalizeSanctionStatus(record.status);
  const today = toDateOnly(new Date());
  const endDate = toDateOnly(record.end_date);
  let daysRemaining = null;
  let displayStatus = normalizedStatus;

  if (endDate && today) {
    daysRemaining = Math.ceil((endDate - today) / 86400000);
  }

  if (normalizedStatus === "active" && daysRemaining !== null) {
    if (daysRemaining < 0) {
      displayStatus = "overdue";
    } else if (daysRemaining <= 7) {
      displayStatus = "due_soon";
    }
  }

  return {
    ...record,
    status: normalizedStatus,
    display_status: displayStatus,
    is_resolved: ["fulfilled", "cancelled"].includes(normalizedStatus),
    days_remaining: daysRemaining
  };
}

async function createSanction(req, res) {
  try {
    const { caseId, sanctionType, description, startDate, endDate, status } = req.body;

    if (!caseId || !sanctionType) {
      return res.status(400).json({
        success: false,
        message: "Case and sanction type are required."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT id, case_number, student_id
      FROM cases
      WHERE id = ?
      LIMIT 1
      `,
      [caseId]
    );

    if (caseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const caseItem = caseRows[0];

    const caseStatus = await getCaseStatusRecord(caseId);
    if (caseStatus && isCaseClosed(caseStatus.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const nextStatus = normalizeSanctionStatus(status);

    const [result] = await pool.query(
      `
      INSERT INTO sanctions
      (case_id, student_id, sanction_type, description, start_date, end_date, status, assigned_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        caseId,
        caseItem.student_id,
        sanctionType,
        description || null,
        startDate || null,
        endDate || null,
        nextStatus,
        req.user.id
      ]
    );

    await pool.query(
      `
      UPDATE cases
      SET status = 'resolved'
      WHERE id = ?
      `,
      [caseId]
    );

    await logAudit({
      userId: req.user.id,
      action: "CREATE_SANCTION",
      targetTable: "sanctions",
      targetId: result.insertId,
      details: `Sanction assigned for ${caseItem.case_number}`,
      ipAddress: req.ip
    });

    await notifySanctionStakeholders({
      caseId,
      studentTitle: "Sanction Assigned",
      studentMessage: `A sanction was assigned for case ${caseItem.case_number}. Please review the sanction details in the portal.`,
      parentTitle: "Sanction Assigned for Your Child",
      parentMessage: `A sanction was assigned for case ${caseItem.case_number}. Please review the sanction details in the portal.`,
      smsMessage: `Philtech-GMA Sanction Notice: A ${String(sanctionType).replaceAll("_", " ")} sanction was assigned for case ${caseItem.case_number}.${startDate ? ` Start: ${startDate}.` : ""}${endDate ? ` End: ${endDate}.` : ""}`
    });

    return res.json({
      success: true,
      message: "Sanction assigned successfully. The case decision is now resolved, and sanction completion can continue from the monitoring workspace."
    });

  } catch (error) {
    console.error("Sanction error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

async function getMySanctions(req, res) {
  try {
    const context = await getActorContext(req.user);
    const studentRows = context.studentId ? [{ id: context.studentId }] : [];

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }

    const studentId = studentRows[0].id;

    const [rows] = await pool.query(
      `
      SELECT 
        s.id,
        s.sanction_type,
        s.description,
        s.status,
        s.start_date,
        s.end_date,
        s.created_at,
        c.case_number,
        c.status AS case_status
      FROM sanctions s
      JOIN cases c ON s.case_id = c.id
      WHERE s.student_id = ?
      ORDER BY s.created_at DESC
      `,
      [studentId]
    );

    return res.json({
      success: true,
      sanctions: rows.map(decorateSanction)
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

async function getParentSanctions(req, res) {
  try {
    const context = await getActorContext(req.user);
    const parentRows = context.parentId ? [{ id: context.parentId }] : [];

    if (!parentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Parent not found"
      });
    }

    const parentId = parentRows[0].id;

    const [rows] = await pool.query(
      `
      SELECT 
        s.sanction_type,
        s.description,
        s.status,
        s.start_date,
        s.end_date,
        s.created_at,
        c.case_number,
        c.status AS case_status,
        COALESCE(u.first_name, st.first_name) AS first_name,
        COALESCE(u.last_name, st.last_name) AS last_name,
        st.student_number
      FROM student_parents sp
      JOIN students st ON sp.student_id = st.id
      LEFT JOIN users u ON st.user_id = u.id
      JOIN cases c ON c.student_id = st.id
      JOIN sanctions s ON s.case_id = c.id
      WHERE sp.parent_id = ?
      ORDER BY s.created_at DESC
      `,
      [parentId]
    );

    return res.json({
      success: true,
      sanctions: rows.map(decorateSanction)
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}

async function getAllSanctions(req, res) {
  try {
    let whereClause = "";
    const params = [];

    if (req.user.role === "teacher") {
      whereClause = "WHERE (c.reported_by_user_id = ? OR c.assigned_to_user_id = ?)";
      params.push(req.user.id, req.user.id);
    }

    if (req.query.status) {
      whereClause += whereClause ? " AND s.status = ?" : "WHERE s.status = ?";
      params.push(normalizeSanctionStatus(req.query.status));
    }

    if (req.query.type) {
      whereClause += whereClause ? " AND s.sanction_type = ?" : "WHERE s.sanction_type = ?";
      params.push(req.query.type);
    }

    if (req.query.search) {
      whereClause += whereClause
        ? `
            AND (
              c.case_number LIKE ?
              OR c.violation_type LIKE ?
              OR st.student_number LIKE ?
              OR COALESCE(u.first_name, st.first_name) LIKE ?
              OR COALESCE(u.last_name, st.last_name) LIKE ?
              OR s.sanction_type LIKE ?
            )
          `
        : `
            WHERE (
              c.case_number LIKE ?
              OR c.violation_type LIKE ?
              OR st.student_number LIKE ?
              OR COALESCE(u.first_name, st.first_name) LIKE ?
              OR COALESCE(u.last_name, st.last_name) LIKE ?
              OR s.sanction_type LIKE ?
            )
          `;
      const pattern = `%${req.query.search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.case_id,
        s.student_id,
        s.sanction_type,
        s.description,
        s.start_date,
        s.end_date,
        s.status,
        s.created_at,
        c.case_number,
        c.violation_type,
        st.student_number,
        COALESCE(u.first_name, st.first_name) AS first_name,
        COALESCE(u.last_name, st.last_name) AS last_name,
        assigner.first_name AS assigned_by_first_name,
        assigner.last_name AS assigned_by_last_name,
        assigner.role AS assigned_by_role
      FROM sanctions s
      JOIN cases c ON s.case_id = c.id
      JOIN students st ON s.student_id = st.id
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN users assigner ON s.assigned_by_user_id = assigner.id
      ${whereClause}
      ORDER BY s.created_at DESC
      `,
      params
    );

    return res.json({
      success: true,
      sanctions: rows.map(item => ({
        ...decorateSanction(item),
        assigned_by_role_label: formatRoleLabel(item.assigned_by_role)
      }))
    });
  } catch (error) {
    console.error("Get all sanctions error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching sanctions."
    });
  }
}

async function updateSanction(req, res) {
  try {
    const { id } = req.params;
    const { startDate, endDate, status, description } = req.body;

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.case_id,
        s.status,
        c.case_number
      FROM sanctions s
      JOIN cases c ON s.case_id = c.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Sanction not found."
      });
    }

    const sanction = rows[0];
    const caseItem = await getCaseForAccess(sanction.case_id, {
      role: req.user.role,
      userId: req.user.id,
      studentId: null,
      parentId: null
    });

    if (!["admin", "discipline_officer"].includes(req.user.role) && !caseItem) {
      return res.status(403).json({
        success: false,
        message: "Forbidden."
      });
    }

    const caseStatus = await getCaseStatusRecord(sanction.case_id);
    if (caseStatus && String(caseStatus.status || "").toLowerCase() === "dismissed") {
      return res.status(400).json({
        success: false,
        message: "Dismissed cases are read-only."
      });
    }

    const nextStatus = status
      ? normalizeSanctionStatus(status)
      : normalizeSanctionStatus(sanction.status);

    await pool.query(
      `
      UPDATE sanctions
      SET
        start_date = ?,
        end_date = ?,
        status = ?,
        description = ?
      WHERE id = ?
      `,
      [
        startDate || null,
        endDate || null,
        nextStatus,
        description || null,
        id
      ]
    );

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_SANCTION",
      targetTable: "sanctions",
      targetId: Number(id),
      details: `Updated sanction for ${sanction.case_number} to status ${nextStatus}`,
      ipAddress: req.ip
    });

    await notifySanctionStakeholders({
      caseId: sanction.case_id,
      studentTitle: "Sanction Updated",
      studentMessage: `Sanction details for case ${sanction.case_number} were updated. Current status: ${nextStatus}.`,
      parentTitle: "Sanction Update for Your Child",
      parentMessage: `Sanction details for case ${sanction.case_number} were updated. Current status: ${nextStatus}.`,
      smsMessage: `Philtech-GMA Sanction Update: Case ${sanction.case_number} sanction is now ${nextStatus.replaceAll("_", " ")}.${startDate ? ` Start: ${startDate}.` : ""}${endDate ? ` End: ${endDate}.` : ""}`
    });

    return res.json({
      success: true,
      message: "Sanction updated successfully."
    });
  } catch (error) {
    console.error("Update sanction error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating sanction."
    });
  }
}
module.exports = {
  createSanction,
  getMySanctions,
  getParentSanctions,
  getAllSanctions,
  updateSanction
};
