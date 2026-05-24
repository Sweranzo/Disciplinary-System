const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { getCaseStatusRecord, isCaseClosed } = require("./caseController");

function buildAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return null;
  }

  if (/^https?:\/\//i.test(avatarPath)) {
    return avatarPath;
  }

  return `http://localhost:${process.env.PORT || 5000}${avatarPath}`;
}

function formatRoleLabel(role = "") {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function getCounselorDashboard(req, res) {
  try {
    const [visibleCases] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM cases
      `
    );

    const [activeCases] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM cases
      WHERE status NOT IN ('resolved', 'dismissed')
      `
    );

    const [followUps] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM counselor_interventions
      WHERE counselor_user_id = ?
        AND status IN ('planned', 'ongoing')
      `,
      [req.user.id]
    );

    const [hearings] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE h.status = 'scheduled'
      `
    );

    const [recentNotes] = await pool.query(
      `
      SELECT
        ci.id,
        ci.note_type,
        ci.note,
        ci.status,
        ci.follow_up_date,
        ci.created_at,
        c.case_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        ci.counselor_user_id,
        counselor.first_name AS counselor_first_name,
        counselor.last_name AS counselor_last_name,
        counselor.role AS counselor_role,
        s.student_number
      FROM counselor_interventions ci
      JOIN cases c ON ci.case_id = c.id
      JOIN students s ON ci.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN users counselor ON ci.counselor_user_id = counselor.id
      WHERE ci.counselor_user_id = ?
      ORDER BY ci.created_at DESC
      LIMIT 10
      `,
      [req.user.id]
    );

    return res.json({
      success: true,
      summary: {
        visibleCases: visibleCases[0].total,
        activeSupportCases: activeCases[0].total,
        activeFollowUps: followUps[0].total,
        scheduledHearings: hearings[0].total
      },
      recentNotes: recentNotes.map(item => ({
        ...item,
        counselor_role_label: formatRoleLabel(item.counselor_role)
      }))
    });
  } catch (error) {
    console.error("Counselor dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching counselor dashboard."
    });
  }
}

async function getCounselorCases(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.incident_date,
        s.student_number,
        COALESCE(u.middle_name, s.middle_name) AS middle_name,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        u.avatar_path AS student_avatar_path,
        s.id AS student_id,
        c.assigned_to_user_id,
        assignee.first_name AS assigned_to_first_name,
        assignee.last_name AS assigned_to_last_name,
        assignee.role AS assigned_to_role
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN users assignee ON c.assigned_to_user_id = assignee.id
      ORDER BY c.created_at DESC
      `
    );

    return res.json({
      success: true,
      cases: rows.map(item => ({
        ...item,
        student_avatar_url: buildAvatarUrl(item.student_avatar_path),
        assigned_to_role_label: formatRoleLabel(item.assigned_to_role),
        support_scope: item.assigned_to_user_id
          ? (Number(item.assigned_to_user_id) === Number(req.user.id) ? "assigned_to_you" : "discipline_owned")
          : "support_queue"
      }))
    });
  } catch (error) {
    console.error("Counselor cases error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching counselor cases."
    });
  }
}

async function getCounselorInterventions(req, res) {
  try {
    const caseId = req.query.caseId || null;
    const studentId = req.query.studentId || null;
    const params = [req.user.id];
    let whereClause = "WHERE ci.counselor_user_id = ?";

    if (caseId) {
      whereClause += " AND ci.case_id = ?";
      params.push(caseId);
    }

    if (studentId) {
      whereClause += " AND ci.student_id = ?";
      params.push(studentId);
    }

    const [rows] = await pool.query(
      `
      SELECT
        ci.id,
        ci.case_id,
        ci.student_id,
        ci.note_type,
        ci.note,
        ci.status,
        ci.follow_up_date,
        ci.created_at,
        c.case_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        counselor.first_name AS counselor_first_name,
        counselor.last_name AS counselor_last_name,
        counselor.role AS counselor_role,
        s.student_number
      FROM counselor_interventions ci
      JOIN cases c ON ci.case_id = c.id
      JOIN students s ON ci.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN users counselor ON ci.counselor_user_id = counselor.id
      ${whereClause}
      ORDER BY ci.created_at DESC
      `,
      params
    );

    return res.json({
      success: true,
      interventions: rows.map(item => ({
        ...item,
        counselor_role_label: formatRoleLabel(item.counselor_role)
      }))
    });
  } catch (error) {
    console.error("Get interventions error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching interventions."
    });
  }
}

async function createCounselorIntervention(req, res) {
  try {
    const { caseId, noteType, note, status, followUpDate } = req.body;

    if (!caseId || !note) {
      return res.status(400).json({
        success: false,
        message: "Case and note are required."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT id, case_number, student_id, status
      FROM cases
      WHERE id = ?
      LIMIT 1
      `,
      [caseId]
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

    const allowedTypes = ["intervention", "behavior_note", "recommendation", "follow_up"];
    const allowedStatuses = ["planned", "ongoing", "completed"];
    const finalType = allowedTypes.includes(noteType) ? noteType : "intervention";
    const finalStatus = allowedStatuses.includes(status) ? status : "planned";

    const [result] = await pool.query(
      `
      INSERT INTO counselor_interventions
      (case_id, student_id, counselor_user_id, note_type, note, status, follow_up_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        caseId,
        caseRows[0].student_id,
        req.user.id,
        finalType,
        note,
        finalStatus,
        followUpDate || null
      ]
    );

    await logAudit({
      userId: req.user.id,
      action: "CREATE_COUNSELOR_INTERVENTION",
      targetTable: "counselor_interventions",
      targetId: result.insertId,
      details: `Added ${finalType} note for ${caseRows[0].case_number}`,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: "Counselor note saved successfully."
    });
  } catch (error) {
    console.error("Create intervention error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving counselor note."
    });
  }
}

async function updateCounselorIntervention(req, res) {
  try {
    const { id } = req.params;
    const { noteType, note, status, followUpDate } = req.body;

    const [rows] = await pool.query(
      `
      SELECT id
      FROM counselor_interventions
      WHERE id = ? AND counselor_user_id = ?
      LIMIT 1
      `,
      [id, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Counselor note not found."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT case_id
      FROM counselor_interventions
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    const caseStatus = caseRows.length ? await getCaseStatusRecord(caseRows[0].case_id) : null;
    if (caseStatus && isCaseClosed(caseStatus.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const allowedTypes = ["intervention", "behavior_note", "recommendation", "follow_up"];
    const allowedStatuses = ["planned", "ongoing", "completed"];

    await pool.query(
      `
      UPDATE counselor_interventions
      SET
        note_type = ?,
        note = ?,
        status = ?,
        follow_up_date = ?
      WHERE id = ?
      `,
      [
        allowedTypes.includes(noteType) ? noteType : "intervention",
        note,
        allowedStatuses.includes(status) ? status : "planned",
        followUpDate || null,
        id
      ]
    );

    return res.json({
      success: true,
      message: "Counselor note updated successfully."
    });
  } catch (error) {
    console.error("Update intervention error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating counselor note."
    });
  }
}

module.exports = {
  getCounselorDashboard,
  getCounselorCases,
  getCounselorInterventions,
  createCounselorIntervention,
  updateCounselorIntervention
};
