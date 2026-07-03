const pool = require("../config/db");
const {
  createWorkflowEvent,
  getCaseProcessAudit,
  labelize,
  notifyCaseStakeholders,
  refreshCaseWorkflow
} = require("../utils/caseWorkflow");
const {
  getActorContext,
  getCaseForAccess,
  getCaseStatusRecord,
  requireCaseMutationAccess,
  isCaseClosed
} = require("./caseController");

const MAJOR_SEVERITIES = new Set(["major", "grave"]);

function toBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function computeReportCompleteness(payload = {}) {
  const severity = String(payload.severity || payload.severityLevel || "").toLowerCase();
  const hasEvidencePath = Boolean(payload.hasEvidence || payload.evidenceCount || payload.evidenceUnavailableReason);
  const checks = [
    { key: "student", label: "Student identified", complete: Boolean(payload.studentNumber || payload.studentId) },
    { key: "violation", label: "Violation selected", complete: Boolean(payload.violation || payload.violationType) },
    { key: "severity", label: "Severity selected", complete: Boolean(payload.severity || payload.severityLevel) },
    { key: "date", label: "Incident date recorded", complete: Boolean(payload.date || payload.incidentDate) },
    { key: "location", label: "Incident location recorded", complete: Boolean(payload.location) },
    { key: "narrative", label: "Narrative has enough detail", complete: String(payload.description || "").trim().length >= 40 },
    { key: "evidence", label: "Evidence attached or unavailable reason recorded", complete: hasEvidencePath }
  ];
  if (MAJOR_SEVERITIES.has(severity)) {
    checks.push({
      key: "major_evidence_policy",
      label: "Major/grave report has evidence or an unavailable-evidence reason",
      complete: hasEvidencePath
    });
  }
  const score = Math.round((checks.filter(item => item.complete).length / checks.length) * 100);

  return {
    score,
    checks,
    missing: checks.filter(item => !item.complete).map(item => item.label)
  };
}

async function ensureCaseAccess(caseId, user) {
  const context = await getActorContext(user);
  const caseItem = await getCaseForAccess(caseId, context);
  return caseItem;
}

async function ensureCaseMutationAccess(caseId, user) {
  const caseStatus = await getCaseStatusRecord(caseId);
  if (caseStatus && isCaseClosed(caseStatus.status)) {
    return {
      allowed: false,
      status: 400,
      message: "Resolved or dismissed cases are read-only."
    };
  }

  const mutationAccess = await requireCaseMutationAccess(caseId, user);
  return mutationAccess;
}

async function saveReportDraft(req, res) {
  try {
    const {
      id,
      studentId,
      studentNumber,
      violation,
      severity,
      date,
      time,
      location,
      description,
      evidenceUnavailableReason
    } = req.body;
    const completeness = computeReportCompleteness(req.body);

    if (id) {
      await pool.query(
        `
        UPDATE case_report_drafts
        SET student_id = ?, student_number = ?, violation_type = ?, severity_level = ?,
            incident_date = ?, incident_time = ?, location = ?, description = ?,
            evidence_unavailable_reason = ?, completeness_score = ?
        WHERE id = ? AND created_by_user_id = ?
        `,
        [
          studentId || null,
          studentNumber || null,
          violation || null,
          severity || null,
          date || null,
          time || null,
          location || null,
          description || null,
          evidenceUnavailableReason || null,
          completeness.score,
          id,
          req.user.id
        ]
      );

      return res.json({ success: true, message: "Draft updated.", draftId: Number(id), completeness });
    }

    const [result] = await pool.query(
      `
      INSERT INTO case_report_drafts
      (created_by_user_id, student_id, student_number, violation_type, severity_level,
       incident_date, incident_time, location, description, evidence_unavailable_reason, completeness_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        studentId || null,
        studentNumber || null,
        violation || null,
        severity || null,
        date || null,
        time || null,
        location || null,
        description || null,
        evidenceUnavailableReason || null,
        completeness.score
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Draft saved.",
      draftId: result.insertId,
      completeness
    });
  } catch (error) {
    console.error("Save report draft error:", error);
    return res.status(500).json({ success: false, message: "Server error while saving draft." });
  }
}

async function listReportDrafts(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM case_report_drafts
      WHERE created_by_user_id = ?
      ORDER BY updated_at DESC
      `,
      [req.user.id]
    );

    return res.json({ success: true, drafts: rows });
  } catch (error) {
    console.error("List report drafts error:", error);
    return res.status(500).json({ success: false, message: "Server error while loading drafts." });
  }
}

async function checkReportCompleteness(req, res) {
  const completeness = computeReportCompleteness(req.body || {});
  return res.json({ success: true, completeness });
}

async function addWitness(req, res) {
  try {
    const { caseId } = req.params;
    const { name, role, contactInfo, notes } = req.body;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });
    const mutationAccess = await ensureCaseMutationAccess(caseId, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });
    if (!name) return res.status(400).json({ success: false, message: "Witness name is required." });

    const [result] = await pool.query(
      `
      INSERT INTO case_witnesses (case_id, name, role, contact_info, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [caseId, name, role || null, contactInfo || null, notes || null, req.user.id]
    );

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "witness_added",
      title: "Witness added",
      details: `${name}${role ? ` (${role})` : ""} was added to the case.`
    });

    await notifyCaseStakeholders({
      caseId,
      title: "Case Witness Added",
      message: `A witness or involved person was added to ${caseItem.case_number}.`,
      includeStudentParents: false,
      includeStaff: true,
      excludeUserId: req.user.id
    });

    return res.status(201).json({ success: true, message: "Witness added.", witnessId: result.insertId });
  } catch (error) {
    console.error("Add witness error:", error);
    return res.status(500).json({ success: false, message: "Server error while adding witness." });
  }
}

async function addStatement(req, res) {
  try {
    const { caseId } = req.params;
    const { subjectRole, statementType, content } = req.body;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });
    const mutationAccess = await ensureCaseMutationAccess(caseId, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });
    if (!content || String(content).trim().length < 5) {
      return res.status(400).json({ success: false, message: "Statement content is required." });
    }

    const allowedRoles = ["student", "parent", "teacher", "witness", "staff"];
    const requestedRole = subjectRole || req.user.role;
    const finalRole = allowedRoles.includes(requestedRole) ? requestedRole : "staff";
    const finalType = statementType || (req.user.role === "parent" ? "parent_response" : req.user.role === "student" ? "student_response" : "staff_note");

    const [result] = await pool.query(
      `
      INSERT INTO case_statements (case_id, submitted_by_user_id, subject_role, statement_type, content)
      VALUES (?, ?, ?, ?, ?)
      `,
      [caseId, req.user.id, finalRole, finalType, content]
    );

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "statement_submitted",
      title: `${labelize(finalRole)} statement submitted`,
      details: content
    });

    await notifyCaseStakeholders({
      caseId,
      title: "Case Statement Submitted",
      message: `${labelize(finalRole)} submitted a statement for ${caseItem.case_number}.`,
      includeStudentParents: false,
      excludeUserId: req.user.id
    });

    return res.status(201).json({ success: true, message: "Statement submitted.", statementId: result.insertId });
  } catch (error) {
    console.error("Add statement error:", error);
    return res.status(500).json({ success: false, message: "Server error while saving statement." });
  }
}

async function addPolicyReference(req, res) {
  try {
    const { caseId } = req.params;
    const { policyRuleId, policyCode, title, notes } = req.body;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });
    const mutationAccess = await ensureCaseMutationAccess(caseId, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });
    if (!title && !policyRuleId) return res.status(400).json({ success: false, message: "Policy title or rule is required." });

    let finalTitle = title;
    let finalCode = policyCode || null;
    if (policyRuleId) {
      const [rules] = await pool.query("SELECT code, title FROM policy_rules WHERE id = ? LIMIT 1", [policyRuleId]);
      if (rules.length) {
        finalTitle = finalTitle || rules[0].title;
        finalCode = finalCode || rules[0].code;
      }
    }

    const [result] = await pool.query(
      `
      INSERT INTO case_policy_refs (case_id, policy_rule_id, policy_code, title, notes, added_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [caseId, policyRuleId || null, finalCode, finalTitle, notes || null, req.user.id]
    );

    await pool.query(
      "UPDATE cases SET policy_basis_summary = ? WHERE id = ?",
      [`${finalCode ? `${finalCode}: ` : ""}${finalTitle}`, caseId]
    );

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "policy_reference",
      title: "Policy reference added",
      details: `${finalCode ? `${finalCode}: ` : ""}${finalTitle}`
    });

    await notifyCaseStakeholders({
      caseId,
      title: "Case Policy Basis Updated",
      message: `${caseItem.case_number} now references ${finalCode ? `${finalCode}: ` : ""}${finalTitle}.`,
      excludeUserId: req.user.id
    });

    return res.status(201).json({ success: true, message: "Policy reference added.", policyRefId: result.insertId });
  } catch (error) {
    console.error("Add policy reference error:", error);
    return res.status(500).json({ success: false, message: "Server error while adding policy reference." });
  }
}

async function createDecision(req, res) {
  try {
    const { caseId } = req.params;
    const { finding, basis, recommendedAction, requiresApproval } = req.body;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });
    const mutationAccess = await ensureCaseMutationAccess(caseId, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });
    if (!finding || !basis) return res.status(400).json({ success: false, message: "Finding and basis are required." });

    const status = toBool(requiresApproval) ? "pending_approval" : "approved";
    const appealDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [result] = await pool.query(
      `
      INSERT INTO case_decisions
      (case_id, finding, basis, recommended_action, requires_approval, status, decided_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [caseId, finding, basis, recommendedAction || null, toBool(requiresApproval) ? 1 : 0, status, req.user.id]
    );

    await pool.query("UPDATE cases SET appeal_deadline_at = ? WHERE id = ?", [appealDeadline, caseId]);

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "case_decision",
      title: "Formal decision recorded",
      details: `${labelize(finding)}. ${basis}`,
      metadata: { decisionId: result.insertId, status }
    });

    const workflow = await refreshCaseWorkflow(caseId);
    await notifyCaseStakeholders({
      caseId,
      title: status === "approved" ? "Formal Case Decision Recorded" : "Case Decision Pending Approval",
      message: `${caseItem.case_number} has a formal decision: ${labelize(finding)}.${recommendedAction ? ` Recommended action: ${recommendedAction}.` : ""} Appeal deadline: ${appealDeadline.toISOString().slice(0, 10)}.`,
      excludeUserId: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Decision recorded.",
      decisionId: result.insertId,
      appeal_deadline_at: appealDeadline,
      workflow
    });
  } catch (error) {
    console.error("Create decision error:", error);
    return res.status(500).json({ success: false, message: "Server error while recording decision." });
  }
}

async function reviewDecision(req, res) {
  try {
    const { decisionId } = req.params;
    const { status, notes } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Decision review status is invalid." });
    }

    const [rows] = await pool.query(
      `
      SELECT d.id, d.case_id, d.finding, c.case_number
      FROM case_decisions d
      JOIN cases c ON c.id = d.case_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [decisionId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Decision not found." });

    await pool.query(
      "UPDATE case_decisions SET status = ? WHERE id = ?",
      [status, decisionId]
    );

    await pool.query(
      `
      INSERT INTO case_decision_approvals (decision_id, approver_user_id, status, notes, reviewed_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [decisionId, req.user.id, status, notes || null]
    );

    await createWorkflowEvent({
      caseId: rows[0].case_id,
      userId: req.user.id,
      eventType: "decision_approval",
      title: `Decision ${labelize(status)}`,
      details: notes || null,
      metadata: { decisionId: Number(decisionId), status }
    });

    await notifyCaseStakeholders({
      caseId: rows[0].case_id,
      title: `Case Decision ${labelize(status)}`,
      message: `${rows[0].case_number} decision (${labelize(rows[0].finding)}) was ${labelize(status)}.${notes ? ` Notes: ${notes}` : ""}`,
      excludeUserId: req.user.id
    });

    return res.json({ success: true, message: `Decision ${status}.` });
  } catch (error) {
    console.error("Review decision error:", error);
    return res.status(500).json({ success: false, message: "Server error while reviewing decision." });
  }
}

async function addHearingAttendee(req, res) {
  try {
    const { hearingId } = req.params;
    const { name, role, attendanceStatus, notes } = req.body;
    if (!name || !role) return res.status(400).json({ success: false, message: "Attendee name and role are required." });

    const [hearings] = await pool.query(
      `
      SELECT h.id, h.case_id, c.case_number
      FROM hearings h
      JOIN cases c ON c.id = h.case_id
      WHERE h.id = ?
      LIMIT 1
      `,
      [hearingId]
    );
    if (!hearings.length) return res.status(404).json({ success: false, message: "Hearing not found." });
    const mutationAccess = await ensureCaseMutationAccess(hearings[0].case_id, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });

    const [result] = await pool.query(
      `
      INSERT INTO hearing_attendees (hearing_id, case_id, name, role, attendance_status, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [hearingId, hearings[0].case_id, name, role, attendanceStatus || "invited", notes || null, req.user.id]
    );

    await createWorkflowEvent({
      caseId: hearings[0].case_id,
      userId: req.user.id,
      eventType: "hearing_attendee",
      title: "Hearing attendee recorded",
      details: `${name} (${labelize(role)}) - ${labelize(attendanceStatus || "invited")}`
    });

    await notifyCaseStakeholders({
      caseId: hearings[0].case_id,
      title: "Hearing Attendance Updated",
      message: `Attendance information was updated for ${hearings[0].case_number}.`,
      includeStudentParents: false,
      includeStaff: true,
      excludeUserId: req.user.id
    });

    return res.status(201).json({ success: true, message: "Hearing attendee saved.", attendeeId: result.insertId });
  } catch (error) {
    console.error("Add hearing attendee error:", error);
    return res.status(500).json({ success: false, message: "Server error while saving attendee." });
  }
}

async function completeSanction(req, res) {
  try {
    const { sanctionId } = req.params;
    const { completionNotes, completionEvidencePath } = req.body;
    if (!completionNotes) return res.status(400).json({ success: false, message: "Completion notes are required." });

    const [rows] = await pool.query(
      "SELECT s.id, s.case_id, c.case_number FROM sanctions s JOIN cases c ON s.case_id = c.id WHERE s.id = ? LIMIT 1",
      [sanctionId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Sanction not found." });
    const mutationAccess = await ensureCaseMutationAccess(rows[0].case_id, req.user);
    if (!mutationAccess.allowed) return res.status(mutationAccess.status).json({ success: false, message: mutationAccess.message });

    await pool.query(
      `
      UPDATE sanctions
      SET status = 'fulfilled', completion_notes = ?, completion_evidence_path = ?, completed_by_user_id = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [completionNotes, completionEvidencePath || null, req.user.id, sanctionId]
    );

    await createWorkflowEvent({
      caseId: rows[0].case_id,
      userId: req.user.id,
      eventType: "sanction_completed",
      title: "Sanction completion recorded",
      details: completionNotes,
      metadata: { sanctionId: Number(sanctionId) }
    });

    const workflow = await refreshCaseWorkflow(rows[0].case_id);
    await notifyCaseStakeholders({
      caseId: rows[0].case_id,
      title: "Sanction Completed",
      message: `The sanction for ${rows[0].case_number} was marked fulfilled. Completion notes: ${completionNotes}`,
      type: "sanction",
      excludeUserId: req.user.id
    });

    return res.json({ success: true, message: "Sanction completion recorded.", workflow });
  } catch (error) {
    console.error("Complete sanction error:", error);
    return res.status(500).json({ success: false, message: "Server error while completing sanction." });
  }
}

async function getAppealEligibility(req, res) {
  try {
    const { caseId } = req.params;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });

    const [rows] = await pool.query("SELECT appeal_deadline_at, status FROM cases WHERE id = ? LIMIT 1", [caseId]);
    const deadline = rows[0]?.appeal_deadline_at ? new Date(rows[0].appeal_deadline_at) : null;
    const now = new Date();
    const eligible = !deadline || now <= deadline;
    return res.json({
      success: true,
      eligible,
      status: eligible ? "eligible" : "late",
      deadline_at: rows[0]?.appeal_deadline_at || null,
      message: eligible ? "Appeal is currently eligible." : "Appeal deadline has passed."
    });
  } catch (error) {
    console.error("Appeal eligibility error:", error);
    return res.status(500).json({ success: false, message: "Server error while checking appeal eligibility." });
  }
}

async function getSlaReport(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT c.id, c.case_number, c.next_action, c.workflow_status, c.created_at,
             TIMESTAMPDIFF(HOUR, c.updated_at, CURRENT_TIMESTAMP) AS hours_waiting,
             sr.max_hours, sr.escalation_role
      FROM cases c
      LEFT JOIN case_sla_rules sr ON c.next_action = sr.next_action AND sr.active = 1
      WHERE c.status NOT IN ('resolved', 'dismissed')
      ORDER BY hours_waiting DESC
      LIMIT 100
      `
    );

    return res.json({
      success: true,
      items: rows.map(item => ({
        ...item,
        overdue: item.max_hours ? Number(item.hours_waiting) > Number(item.max_hours) : false,
        next_action_label: labelize(item.next_action)
      }))
    });
  } catch (error) {
    console.error("SLA report error:", error);
    return res.status(500).json({ success: false, message: "Server error while loading SLA report." });
  }
}

async function exportCasePacket(req, res) {
  try {
    const { caseId } = req.params;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });

    const queries = await Promise.all([
      pool.query("SELECT * FROM cases WHERE id = ?", [caseId]),
      pool.query("SELECT * FROM case_evidence WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM hearings WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM hearing_attendees WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM sanctions WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM appeals WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM case_statements WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM case_witnesses WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM case_policy_refs WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM case_decisions WHERE case_id = ?", [caseId]),
      pool.query("SELECT * FROM case_workflow_events WHERE case_id = ? ORDER BY created_at ASC", [caseId])
    ]);

    const packet = {
      generated_at: new Date().toISOString(),
      generated_by_user_id: req.user.id,
      case: queries[0][0][0],
      evidence: queries[1][0],
      hearings: queries[2][0],
      hearing_attendees: queries[3][0],
      sanctions: queries[4][0],
      appeals: queries[5][0],
      statements: queries[6][0],
      witnesses: queries[7][0],
      policy_refs: queries[8][0],
      decisions: queries[9][0],
      workflow_events: queries[10][0],
      process_audit: await getCaseProcessAudit(caseId)
    };

    await pool.query(
      "INSERT INTO case_packet_exports (case_id, exported_by_user_id, packet_json) VALUES (?, ?, ?)",
      [caseId, req.user.id, JSON.stringify(packet)]
    );

    return res.json({ success: true, packet });
  } catch (error) {
    console.error("Export case packet error:", error);
    return res.status(500).json({ success: false, message: "Server error while exporting packet." });
  }
}

async function getFormalProcess(req, res) {
  try {
    const { caseId } = req.params;
    const caseItem = await ensureCaseAccess(caseId, req.user);
    if (!caseItem) return res.status(404).json({ success: false, message: "Case not found." });

    const [witnesses] = await pool.query("SELECT * FROM case_witnesses WHERE case_id = ? ORDER BY created_at DESC", [caseId]);
    const [statements] = await pool.query("SELECT * FROM case_statements WHERE case_id = ? ORDER BY submitted_at DESC", [caseId]);
    const [policies] = await pool.query("SELECT * FROM case_policy_refs WHERE case_id = ? ORDER BY created_at DESC", [caseId]);
    const [decisions] = await pool.query("SELECT * FROM case_decisions WHERE case_id = ? ORDER BY decided_at DESC", [caseId]);

    return res.json({
      success: true,
      witnesses,
      statements,
      policies,
      decisions,
      audit: await getCaseProcessAudit(caseId)
    });
  } catch (error) {
    console.error("Formal process fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error while loading formal process." });
  }
}

module.exports = {
  addHearingAttendee,
  addPolicyReference,
  addStatement,
  addWitness,
  checkReportCompleteness,
  completeSanction,
  createDecision,
  exportCasePacket,
  getAppealEligibility,
  getFormalProcess,
  getSlaReport,
  listReportDrafts,
  reviewDecision,
  saveReportDraft
};
