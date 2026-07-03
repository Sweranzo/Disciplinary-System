const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const {
  getActorContext,
  getCaseForAccess,
  getCaseStatusRecord,
  requireCaseMutationAccess,
  isCaseClosed
} = require("./caseController");
const {
  createWorkflowEvent,
  labelize,
  notifyCaseStakeholders,
  refreshCaseWorkflow
} = require("../utils/caseWorkflow");

function formatRoleLabel(role = "") {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function createAppeal(req, res) {
  try {
    const { caseId, reason } = req.body;

    if (!caseId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Case and reason are required."
      });
    }

    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(caseId, context);

    if (!caseItem || req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Forbidden."
      });
    }

    const caseStatus = await getCaseStatusRecord(caseId);
    if (caseStatus && isCaseClosed(caseStatus.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const [deadlineRows] = await pool.query(
      "SELECT appeal_deadline_at FROM cases WHERE id = ? LIMIT 1",
      [caseId]
    );
    const appealDeadline = deadlineRows[0]?.appeal_deadline_at || null;
    if (appealDeadline && new Date() > new Date(appealDeadline)) {
      return res.status(400).json({
        success: false,
        message: "Appeal deadline has passed."
      });
    }

    const [existingRows] = await pool.query(
      `
      SELECT id
      FROM appeals
      WHERE case_id = ? AND submitted_by_user_id = ? AND status IN ('submitted', 'under_review')
      LIMIT 1
      `,
      [caseId, req.user.id]
    );

    if (existingRows.length) {
      return res.status(400).json({
        success: false,
        message: "An active appeal already exists for this case."
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO appeals
      (case_id, student_id, submitted_by_user_id, reason, deadline_at, eligibility_status, status)
      VALUES (?, ?, ?, ?, ?, 'eligible', 'submitted')
      `,
      [caseId, context.studentId, req.user.id, reason, appealDeadline]
    );

    await logAudit({
      userId: req.user.id,
      action: "CREATE_APPEAL",
      targetTable: "appeals",
      targetId: result.insertId,
      details: `Submitted appeal for ${caseItem.case_number}`,
      ipAddress: req.ip
    });

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "appeal_submitted",
      title: "Appeal submitted",
      details: "Student submitted an appeal for review.",
      metadata: { appealId: result.insertId }
    });

    const workflow = await refreshCaseWorkflow(caseId);

    await notifyCaseStakeholders({
      caseId,
      title: "Appeal Submitted",
      message: `An appeal was submitted for ${caseItem.case_number}. Next action: ${workflow?.next_action_label || "Review Appeal"}.`,
      type: "appeal",
      includeStudentParents: false,
      excludeUserId: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Appeal submitted successfully.",
      workflow
    });
  } catch (error) {
    console.error("Create appeal error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating appeal."
    });
  }
}

async function getMyAppeals(req, res) {
  try {
    const context = await getActorContext(req.user);

    if (!context.studentId) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        a.id,
        a.case_id,
        a.student_id,
        a.reason,
        a.deadline_at,
        a.eligibility_status,
        a.eligibility_notes,
        a.status,
        a.decision_notes,
        a.reviewed_at,
        a.created_at,
        c.case_number,
        c.violation_type,
        submitter.first_name AS submitted_by_first_name,
        submitter.last_name AS submitted_by_last_name,
        submitter.role AS submitted_by_role,
        reviewer.first_name AS reviewed_by_first_name,
        reviewer.last_name AS reviewed_by_last_name,
        reviewer.role AS reviewed_by_role
      FROM appeals a
      JOIN cases c ON a.case_id = c.id
      JOIN users submitter ON a.submitted_by_user_id = submitter.id
      LEFT JOIN users reviewer ON a.reviewed_by_user_id = reviewer.id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
      `,
      [context.studentId]
    );

    return res.json({
      success: true,
      appeals: rows.map(item => ({
        ...item,
        submitted_by_role_label: formatRoleLabel(item.submitted_by_role),
        reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
      }))
    });
  } catch (error) {
    console.error("Get my appeals error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching appeals."
    });
  }
}

async function getAllAppeals(req, res) {
  try {
    let whereClause = "";
    const params = [];

    if (req.query.status) {
      whereClause = "WHERE a.status = ?";
      params.push(req.query.status);
    }

    const [rows] = await pool.query(
      `
      SELECT
        a.id,
        a.case_id,
        a.student_id,
        a.reason,
        a.deadline_at,
        a.eligibility_status,
        a.eligibility_notes,
        a.status,
        a.decision_notes,
        a.reviewed_at,
        a.created_at,
        c.case_number,
        c.violation_type,
        s.student_number,
        COALESCE(student_user.first_name, s.first_name) AS first_name,
        COALESCE(student_user.last_name, s.last_name) AS last_name,
        reviewer.first_name AS reviewed_by_first_name,
        reviewer.last_name AS reviewed_by_last_name,
        reviewer.role AS reviewed_by_role
      FROM appeals a
      JOIN cases c ON a.case_id = c.id
      JOIN students s ON a.student_id = s.id
      LEFT JOIN users student_user ON s.user_id = student_user.id
      LEFT JOIN users reviewer ON a.reviewed_by_user_id = reviewer.id
      ${whereClause}
      ORDER BY a.created_at DESC
      `,
      params
    );

    return res.json({
      success: true,
      appeals: rows.map(item => ({
        ...item,
        reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
      }))
    });
  } catch (error) {
    console.error("Get all appeals error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching appeals."
    });
  }
}

async function reviewAppeal(req, res) {
  try {
    const { id } = req.params;
    const { status, decisionNotes } = req.body;
    const allowedStatuses = ["under_review", "approved", "rejected"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appeal status."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT a.id, a.case_id, c.case_number
      FROM appeals a
      JOIN cases c ON a.case_id = c.id
      WHERE a.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Appeal not found."
      });
    }

    const caseStatus = await getCaseStatusRecord(rows[0].case_id);
    if (caseStatus && isCaseClosed(caseStatus.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const mutationAccess = await requireCaseMutationAccess(rows[0].case_id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    await pool.query(
      `
      UPDATE appeals
      SET
        status = ?,
        decision_notes = ?,
        reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [status, decisionNotes || null, req.user.id, id]
    );

    await logAudit({
      userId: req.user.id,
      action: "REVIEW_APPEAL",
      targetTable: "appeals",
      targetId: Number(id),
      details: `Updated appeal for ${rows[0].case_number} to ${status}`,
      ipAddress: req.ip
    });

    await createWorkflowEvent({
      caseId: rows[0].case_id,
      userId: req.user.id,
      eventType: "appeal_reviewed",
      title: "Appeal reviewed",
      details: `Appeal was marked ${labelize(status)}.${decisionNotes ? ` Decision notes: ${decisionNotes}` : ""}`,
      metadata: { appealId: Number(id), status }
    });

    const workflow = await refreshCaseWorkflow(rows[0].case_id);

    await notifyCaseStakeholders({
      caseId: rows[0].case_id,
      title: "Appeal Decision Updated",
      message: `Appeal status for ${rows[0].case_number} is now ${labelize(status)}. Next action: ${workflow?.next_action_label || "Review Case"}.`,
      type: "appeal",
      excludeUserId: req.user.id
    });

    return res.json({
      success: true,
      message: "Appeal updated successfully.",
      workflow
    });
  } catch (error) {
    console.error("Review appeal error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reviewing appeal."
    });
  }
}

module.exports = {
  createAppeal,
  getMyAppeals,
  getAllAppeals,
  reviewAppeal
};
