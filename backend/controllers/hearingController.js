const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { getCaseForAccess, getCaseStatusRecord, isCaseClosed } = require("./caseController");

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

async function createHearing(req, res) {
  try {
    const { caseId, scheduledDate, scheduledTime, location } = req.body;

    if (!caseId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({
        success: false,
        message: "Case, date, and time are required."
      });
    }

    const [caseRows] = await pool.query(
      "SELECT id, case_number, status FROM cases WHERE id = ? LIMIT 1",
      [caseId]
    );

    if (caseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const caseItem = caseRows[0];

    const [result] = await pool.query(
      `
      INSERT INTO hearings
      (case_id, scheduled_date, scheduled_time, location, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [caseId, scheduledDate, scheduledTime, location || null, req.user.id]
    );

    await pool.query(
      `
      UPDATE cases
      SET status = 'hearing_scheduled', hearing_required = 1
      WHERE id = ?
      `,
      [caseId]
    );

    await logAudit({
      userId: req.user.id,
      action: "CREATE_HEARING",
      targetTable: "hearings",
      targetId: result.insertId,
      details: `Hearing scheduled for ${caseItem.case_number}`,
      ipAddress: req.ip
    });

    const [recipientRows] = await pool.query(
  `
  SELECT 
    su.id AS student_user_id,
    pu.id AS parent_user_id
  FROM cases c
  JOIN students s ON c.student_id = s.id
  LEFT JOIN users su ON s.user_id = su.id
  LEFT JOIN student_parents sp ON sp.student_id = s.id
  LEFT JOIN parents p ON sp.parent_id = p.id
  LEFT JOIN users pu ON p.user_id = pu.id
  WHERE c.id = ?
  LIMIT 1
  `,
  [caseId]
);

if (recipientRows.length > 0) {
  const row = recipientRows[0];

  if (row.student_user_id) {
    await createNotification(
      row.student_user_id,
      "Hearing Scheduled",
      `A hearing has been scheduled for case ${caseItem.case_number} on ${scheduledDate} at ${scheduledTime}.`,
      "hearing"
    );
  }

  if (row.parent_user_id) {
    await createNotification(
      row.parent_user_id,
      "Hearing Scheduled for Your Child",
      `A hearing has been scheduled for case ${caseItem.case_number} on ${scheduledDate} at ${scheduledTime}.`,
      "hearing"
    );
  }
}

    return res.status(201).json({
      success: true,
      message: "Hearing scheduled successfully."
    });
  } catch (error) {
    console.error("Create hearing error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while scheduling hearing."
    });
  }
}

async function getAllHearings(req, res) {
  try {
    let whereClause = "";
    const params = [];

    if (req.user.role === "teacher") {
      whereClause = "WHERE (c.reported_by_user_id = ? OR c.assigned_to_user_id = ?)";
      params.push(req.user.id, req.user.id);
    }

    if (req.query.status) {
      whereClause += whereClause ? " AND h.status = ?" : "WHERE h.status = ?";
      params.push(req.query.status);
    }

    if (req.query.dateFrom) {
      whereClause += whereClause ? " AND h.scheduled_date >= ?" : "WHERE h.scheduled_date >= ?";
      params.push(req.query.dateFrom);
    }

    const [rows] = await pool.query(
      `
      SELECT
        h.id,
        h.case_id,
        h.scheduled_date,
        h.scheduled_time,
        h.location,
        h.outcome,
        h.status,
        h.created_at,
        c.case_number,
        c.violation_type,
        c.status AS case_status,
        s.student_number,
        COALESCE(student_user.first_name, s.first_name) AS first_name,
        COALESCE(student_user.last_name, s.last_name) AS last_name,
        creator.first_name AS created_by_first_name,
        creator.last_name AS created_by_last_name,
        creator.role AS created_by_role
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users student_user ON s.user_id = student_user.id
      JOIN users creator ON h.created_by_user_id = creator.id
      ${whereClause}
      ORDER BY h.scheduled_date DESC, h.scheduled_time DESC
      `,
      params
    );

    return res.json({
      success: true,
      hearings: rows.map(item => ({
        ...item,
        created_by_role_label: formatRoleLabel(item.created_by_role)
      }))
    });
  } catch (error) {
    console.error("Get hearings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching hearings."
    });
  }
}

async function updateHearing(req, res) {
  try {
    const { id } = req.params;
    const { scheduledDate, scheduledTime, location, status, outcome } = req.body;

    const [rows] = await pool.query(
      `
      SELECT
        h.id,
        h.case_id,
        h.status,
        c.case_number
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE h.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Hearing not found."
      });
    }

    const hearing = rows[0];
    const caseItem = await getCaseForAccess(hearing.case_id, {
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

    const caseStatus = await getCaseStatusRecord(hearing.case_id);
    if (caseStatus && isCaseClosed(caseStatus.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const allowedStatuses = ["scheduled", "completed", "cancelled"];
    const nextStatus = status && allowedStatuses.includes(status) ? status : hearing.status;

    await pool.query(
      `
      UPDATE hearings
      SET
        scheduled_date = COALESCE(?, scheduled_date),
        scheduled_time = COALESCE(?, scheduled_time),
        location = COALESCE(?, location),
        status = ?,
        outcome = ?
      WHERE id = ?
      `,
      [
        scheduledDate || null,
        scheduledTime || null,
        location || null,
        nextStatus,
        outcome || null,
        id
      ]
    );

    if (nextStatus === "completed") {
      await pool.query(
        `
        UPDATE cases
        SET status = CASE
          WHEN status = 'hearing_scheduled' THEN 'under_investigation'
          ELSE status
        END
        WHERE id = ?
        `,
        [hearing.case_id]
      );
    }

    if (nextStatus === "cancelled") {
      await pool.query(
        `
        UPDATE cases
        SET status = CASE
          WHEN status = 'hearing_scheduled' THEN 'under_investigation'
          ELSE status
        END
        WHERE id = ?
        `,
        [hearing.case_id]
      );
    }

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_HEARING",
      targetTable: "hearings",
      targetId: Number(id),
      details: `Updated hearing for ${hearing.case_number} to status ${nextStatus}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Hearing updated successfully."
    });
  } catch (error) {
    console.error("Update hearing error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating hearing."
    });
  }
}

module.exports = { createHearing, getAllHearings, updateHearing };
