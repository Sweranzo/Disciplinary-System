const path = require("path");
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

async function uploadEvidence(req, res) {
  try {
    const { caseId, evidenceCategory, evidencePurpose, sourceLabel } = req.body;

    if (!caseId || !req.file) {
      return res.status(400).json({
        success: false,
        message: "Case and evidence file are required."
      });
    }

    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(caseId, context);

    if (!caseItem || !["admin", "discipline_officer", "teacher"].includes(req.user.role)) {
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

    const mutationAccess = await requireCaseMutationAccess(caseId, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    const relativePath = `/uploads/evidence/${req.file.filename}`;

    const [result] = await pool.query(
      `
      INSERT INTO case_evidence
      (
        case_id,
        uploaded_by_user_id,
        file_name,
        file_path,
        file_type,
        original_name,
        file_size,
        evidence_category,
        evidence_purpose,
        source_label,
        review_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        caseId,
        req.user.id,
        req.file.filename,
        relativePath,
        req.file.mimetype || null,
        req.file.originalname,
        req.file.size,
        evidenceCategory || "other",
        evidencePurpose || null,
        sourceLabel || null
      ]
    );

    await logAudit({
      userId: req.user.id,
      action: "UPLOAD_EVIDENCE",
      targetTable: "case_evidence",
      targetId: result.insertId,
      details: `Uploaded evidence for ${caseItem.case_number}`,
      ipAddress: req.ip
    });

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "evidence_uploaded",
      title: "Evidence uploaded",
      details: `${req.file.originalname || req.file.filename} was uploaded for review.`
    });

    const workflow = await refreshCaseWorkflow(caseId);

    await notifyCaseStakeholders({
      caseId,
      title: "Evidence Uploaded",
      message: `New evidence was uploaded for ${caseItem.case_number}. Next action: ${workflow?.next_action_label || "Review Evidence"}.`,
      type: "evidence",
      includeStudentParents: false,
      excludeUserId: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Evidence uploaded successfully.",
      workflow
    });
  } catch (error) {
    console.error("Upload evidence error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while uploading evidence."
    });
  }
}

async function getCaseEvidence(req, res) {
  try {
    const { caseId } = req.params;
    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(caseId, context);

    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: "Case not found."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        ce.id,
        ce.case_id,
        ce.file_name,
        ce.file_path,
        ce.file_type,
        ce.original_name,
        ce.file_size,
        ce.evidence_category,
        ce.evidence_purpose,
        ce.source_label,
        ce.review_status,
        ce.review_notes,
        ce.reviewed_at,
        ce.uploaded_at,
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
      [caseId]
    );

    return res.json({
      success: true,
      evidence: rows.map(item => ({
        ...item,
        uploaded_by_role_label: formatRoleLabel(item.uploaded_by_role),
        reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
      }))
    });
  } catch (error) {
    console.error("Get case evidence error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching evidence."
    });
  }
}

async function reviewEvidence(req, res) {
  try {
    const { id } = req.params;
    const { reviewStatus, reviewNotes } = req.body;
    const allowedStatuses = ["pending", "approved", "rejected"];

    if (!allowedStatuses.includes(reviewStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review status."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT ce.id, ce.case_id, c.case_number
      FROM case_evidence ce
      JOIN cases c ON ce.case_id = c.id
      WHERE ce.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Evidence not found."
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
      UPDATE case_evidence
      SET
        review_status = ?,
        review_notes = ?,
        reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [reviewStatus, reviewNotes || null, req.user.id, id]
    );

    await logAudit({
      userId: req.user.id,
      action: "REVIEW_EVIDENCE",
      targetTable: "case_evidence",
      targetId: Number(id),
      details: `Marked evidence for ${rows[0].case_number} as ${reviewStatus}`,
      ipAddress: req.ip
    });

    await createWorkflowEvent({
      caseId: rows[0].case_id,
      userId: req.user.id,
      eventType: "evidence_reviewed",
      title: "Evidence reviewed",
      details: `Evidence was marked ${labelize(reviewStatus)}.${reviewNotes ? ` Notes: ${reviewNotes}` : ""}`,
      metadata: { reviewStatus }
    });

    const workflow = await refreshCaseWorkflow(rows[0].case_id);

    await notifyCaseStakeholders({
      caseId: rows[0].case_id,
      title: "Evidence Reviewed",
      message: `Evidence for ${rows[0].case_number} was marked ${labelize(reviewStatus)}. Next action: ${workflow?.next_action_label || "Review Case"}.`,
      type: "evidence",
      excludeUserId: req.user.id
    });

    return res.json({
      success: true,
      message: "Evidence reviewed successfully.",
      workflow
    });
  } catch (error) {
    console.error("Review evidence error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reviewing evidence."
    });
  }
}

async function getAllEvidence(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        ce.id,
        ce.case_id,
        ce.file_name,
        ce.file_path,
        ce.original_name,
        ce.file_size,
        ce.evidence_category,
        ce.evidence_purpose,
        ce.source_label,
        ce.review_status,
        ce.review_notes,
        ce.reviewed_at,
        ce.uploaded_at,
        c.case_number,
        COALESCE(student_user.first_name, s.first_name) AS first_name,
        COALESCE(student_user.last_name, s.last_name) AS last_name,
        s.student_number,
        uploader.first_name AS uploaded_by_first_name,
        uploader.last_name AS uploaded_by_last_name,
        uploader.role AS uploaded_by_role
      FROM case_evidence ce
      JOIN cases c ON ce.case_id = c.id
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users student_user ON s.user_id = student_user.id
      JOIN users uploader ON ce.uploaded_by_user_id = uploader.id
      ORDER BY ce.uploaded_at DESC
      `
    );

    return res.json({
      success: true,
      evidence: rows.map(item => ({
        ...item,
        uploaded_by_role_label: formatRoleLabel(item.uploaded_by_role)
      }))
    });
  } catch (error) {
    console.error("Get all evidence error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching evidence."
    });
  }
}

module.exports = {
  uploadEvidence,
  getCaseEvidence,
  reviewEvidence,
  getAllEvidence
};
