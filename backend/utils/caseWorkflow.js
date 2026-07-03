const pool = require("../config/db");

const REVIEW_STATUSES = ["pending_review", "validated", "incomplete", "duplicate", "needs_more_evidence"];

function labelize(value = "") {
  return String(value || "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function isClosedStatus(status) {
  return ["resolved", "dismissed"].includes(String(status || "").toLowerCase());
}

function workflowMessage(nextAction) {
  const messages = {
    review_report: "Review the teacher report and mark it valid, incomplete, duplicate, or needing evidence.",
    needs_more_evidence: "Request or review additional evidence before moving the case forward.",
    resolve_duplicate: "Confirm the duplicate reference and decide whether this case should be dismissed.",
    needs_assignment: "Assign or claim an owner so the case does not remain unattended.",
    needs_evidence_review: "Review pending evidence before the next decision.",
    schedule_hearing: "Schedule a hearing or continue investigation if a hearing is not required.",
    awaiting_hearing_result: "Record the hearing result and recommendation.",
    issue_sanction: "Issue the recommended sanction or record a final decision.",
    counseling_follow_up: "Record counseling recommendation or follow-up action.",
    awaiting_appeal_review: "Review the active appeal and record a decision.",
    closure_checklist: "Complete the closure checklist and final notes.",
    closed: "No further action is required."
  };

  return messages[nextAction] || "Review the case and choose the next procedural action.";
}

async function createWorkflowEvent({
  caseId,
  userId = null,
  eventType,
  title,
  details = null,
  metadata = null
}) {
  await pool.query(
    `
    INSERT INTO case_workflow_events
    (case_id, user_id, event_type, title, details, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      caseId,
      userId,
      eventType,
      title,
      details,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

async function createNotification(userId, title, message, type = "case") {
  if (!userId) {
    return;
  }

  await pool.query(
    `
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, ?, ?, ?)
    `,
    [userId, title, message, type]
  );
}

async function getCaseStakeholders(caseId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id AS case_id,
      c.case_number,
      c.reported_by_user_id,
      c.assigned_to_user_id,
      s.user_id AS student_user_id,
      pu.id AS parent_user_id
    FROM cases c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN student_parents sp ON sp.student_id = s.id
    LEFT JOIN parents p ON sp.parent_id = p.id
    LEFT JOIN users pu ON p.user_id = pu.id
    WHERE c.id = ?
    `,
    [caseId]
  );

  const stakeholders = {
    caseNumber: rows[0]?.case_number || "",
    staff: new Set(),
    studentParents: new Set()
  };

  rows.forEach(row => {
    if (row.reported_by_user_id) stakeholders.staff.add(row.reported_by_user_id);
    if (row.assigned_to_user_id) stakeholders.staff.add(row.assigned_to_user_id);
    if (row.student_user_id) stakeholders.studentParents.add(row.student_user_id);
    if (row.parent_user_id) stakeholders.studentParents.add(row.parent_user_id);
  });

  return stakeholders;
}

async function notifyCaseStakeholders({
  caseId,
  title,
  message,
  type = "case",
  includeStudentParents = true,
  includeStaff = true,
  excludeUserId = null
}) {
  const stakeholders = await getCaseStakeholders(caseId);
  const targets = new Set();

  if (includeStaff) {
    stakeholders.staff.forEach(id => targets.add(id));
  }

  if (includeStudentParents) {
    stakeholders.studentParents.forEach(id => targets.add(id));
  }

  targets.delete(null);
  if (excludeUserId) {
    targets.delete(Number(excludeUserId));
  }

  for (const userId of targets) {
    await createNotification(userId, title, message, type);
  }
}

async function getWorkflowSnapshot(caseId) {
  const [caseRows] = await pool.query(
    `
    SELECT
      c.*,
      duplicate.case_number AS duplicate_case_number
    FROM cases c
    LEFT JOIN cases duplicate ON c.duplicate_of_case_id = duplicate.id
    WHERE c.id = ?
    LIMIT 1
    `,
    [caseId]
  );

  if (!caseRows.length) {
    return null;
  }

  const [countRows] = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM case_evidence WHERE case_id = ?) AS evidence_total,
      (SELECT COUNT(*) FROM case_evidence WHERE case_id = ? AND review_status = 'pending') AS evidence_pending,
      (SELECT COUNT(*) FROM hearings WHERE case_id = ?) AS hearings_total,
      (SELECT COUNT(*) FROM hearings WHERE case_id = ? AND status = 'scheduled') AS hearings_scheduled,
      (SELECT COUNT(*) FROM hearings WHERE case_id = ? AND status = 'completed') AS hearings_completed,
      (SELECT COUNT(*) FROM hearings WHERE case_id = ? AND status = 'completed' AND finding IN ('sanction_recommended')) AS sanction_recommended,
      (SELECT COUNT(*) FROM hearings WHERE case_id = ? AND status = 'completed' AND finding IN ('counseling_recommended')) AS counseling_recommended,
      (SELECT COUNT(*) FROM sanctions WHERE case_id = ?) AS sanctions_total,
      (SELECT COUNT(*) FROM appeals WHERE case_id = ? AND status IN ('submitted', 'under_review')) AS active_appeals,
      (SELECT COUNT(*) FROM counselor_interventions WHERE case_id = ?) AS counselor_actions,
      (SELECT COUNT(*) FROM case_acknowledgements WHERE case_id = ?) AS acknowledgements_total,
      (SELECT COUNT(*) FROM case_evidence WHERE case_id = ? AND (evidence_category IS NULL OR evidence_purpose IS NULL OR evidence_purpose = '')) AS evidence_missing_metadata,
      (SELECT COUNT(*) FROM case_witnesses WHERE case_id = ?) AS witnesses_total,
      (SELECT COUNT(*) FROM case_statements WHERE case_id = ? AND subject_role = 'student') AS student_statements,
      (SELECT COUNT(*) FROM case_statements WHERE case_id = ? AND subject_role = 'parent') AS parent_statements,
      (SELECT COUNT(*) FROM case_policy_refs WHERE case_id = ?) AS policy_refs_total,
      (SELECT COUNT(*) FROM case_decisions WHERE case_id = ?) AS decisions_total,
      (SELECT COUNT(*) FROM case_decisions WHERE case_id = ? AND requires_approval = 1 AND status <> 'approved') AS pending_decision_approvals,
      (SELECT COUNT(*) FROM hearings h WHERE h.case_id = ? AND h.status = 'completed' AND NOT EXISTS (SELECT 1 FROM hearing_attendees ha WHERE ha.hearing_id = h.id)) AS completed_hearings_missing_attendance,
      (SELECT COUNT(*) FROM sanctions WHERE case_id = ? AND status = 'fulfilled' AND (completion_notes IS NULL OR completion_notes = '')) AS fulfilled_sanctions_missing_proof,
      (SELECT COUNT(*) FROM sanctions WHERE case_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date < CURRENT_DATE) AS overdue_sanctions,
      (SELECT COUNT(*) FROM case_packet_exports WHERE case_id = ?) AS packet_exports_total,
      (SELECT TIMESTAMPDIFF(HOUR, c.updated_at, CURRENT_TIMESTAMP) FROM cases c WHERE c.id = ?) AS hours_since_update,
      (SELECT max_hours FROM case_sla_rules sr JOIN cases c ON c.next_action = sr.next_action WHERE c.id = ? AND sr.active = 1 LIMIT 1) AS sla_max_hours
    `,
    [
      caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId,
      caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId, caseId,
      caseId, caseId, caseId
    ]
  );

  return {
    case: caseRows[0],
    counts: countRows[0]
  };
}

function determineWorkflow(snapshot) {
  const item = snapshot.case;
  const counts = snapshot.counts;
  let workflowStatus = "investigation";
  let nextAction = "schedule_hearing";

  if (isClosedStatus(item.status)) {
    return { workflowStatus: "closed", nextAction: "closed" };
  }

  if (item.review_status === "pending_review") {
    return { workflowStatus: "review", nextAction: "review_report" };
  }

  if (["incomplete", "needs_more_evidence"].includes(item.review_status)) {
    return { workflowStatus: "review", nextAction: "needs_more_evidence" };
  }

  if (item.review_status === "duplicate") {
    return { workflowStatus: "review", nextAction: "resolve_duplicate" };
  }

  if (!item.assigned_to_user_id) {
    return { workflowStatus: "assignment", nextAction: "needs_assignment" };
  }

  if (Number(counts.active_appeals) > 0) {
    return { workflowStatus: "appeal", nextAction: "awaiting_appeal_review" };
  }

  if (Number(counts.evidence_pending) > 0) {
    return { workflowStatus: "evidence_review", nextAction: "needs_evidence_review" };
  }

  if (Number(counts.hearings_scheduled) > 0) {
    return { workflowStatus: "hearing", nextAction: "awaiting_hearing_result" };
  }

  if (Number(counts.sanction_recommended) > 0 && Number(counts.sanctions_total) === 0) {
    return { workflowStatus: "decision", nextAction: "issue_sanction" };
  }

  if (Number(counts.counseling_recommended) > 0 && Number(counts.counselor_actions) === 0) {
    return { workflowStatus: "decision", nextAction: "counseling_follow_up" };
  }

  if (Number(counts.hearings_completed) > 0 || Number(counts.sanctions_total) > 0) {
    return { workflowStatus: "decision", nextAction: "closure_checklist" };
  }

  if (item.hearing_required) {
    workflowStatus = "hearing";
    nextAction = "schedule_hearing";
  }

  return { workflowStatus, nextAction };
}

async function refreshCaseWorkflow(caseId) {
  const snapshot = await getWorkflowSnapshot(caseId);
  if (!snapshot) {
    return null;
  }

  const { workflowStatus, nextAction } = determineWorkflow(snapshot);
  const notes = workflowMessage(nextAction);

  await pool.query(
    `
    UPDATE cases
    SET workflow_status = ?, next_action = ?, next_action_notes = ?
    WHERE id = ?
    `,
    [workflowStatus, nextAction, notes, caseId]
  );

  return {
    workflow_status: workflowStatus,
    next_action: nextAction,
    next_action_label: labelize(nextAction),
    next_action_notes: notes
  };
}

async function acknowledgeCase({ caseId, user }) {
  await pool.query(
    `
    INSERT INTO case_acknowledgements (case_id, user_id, role)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE acknowledged_at = CURRENT_TIMESTAMP, role = VALUES(role)
    `,
    [caseId, user.id, user.role]
  );

  await createWorkflowEvent({
    caseId,
    userId: user.id,
    eventType: "acknowledgement",
    title: "Case notice acknowledged",
    details: `${labelize(user.role)} acknowledged the case notice.`
  });
}

async function getAcknowledgements(caseId) {
  const [rows] = await pool.query(
    `
    SELECT
      ca.id,
      ca.case_id,
      ca.user_id,
      ca.role,
      ca.acknowledged_at,
      u.first_name,
      u.last_name,
      u.username
    FROM case_acknowledgements ca
    JOIN users u ON ca.user_id = u.id
    WHERE ca.case_id = ?
    ORDER BY ca.acknowledged_at DESC
    `,
    [caseId]
  );

  return rows.map(row => ({
    ...row,
    role_label: labelize(row.role)
  }));
}

async function getWorkflowEvents(caseId) {
  const [rows] = await pool.query(
    `
    SELECT
      cwe.id,
      cwe.case_id,
      cwe.user_id,
      cwe.event_type,
      cwe.title,
      cwe.details,
      cwe.metadata,
      cwe.created_at,
      u.first_name,
      u.last_name,
      u.role
    FROM case_workflow_events cwe
    LEFT JOIN users u ON cwe.user_id = u.id
    WHERE cwe.case_id = ?
    ORDER BY cwe.created_at DESC
    `,
    [caseId]
  );

  return rows.map(row => ({
    ...row,
    role_label: labelize(row.role)
  }));
}

async function getRepeatViolationSummary({ studentId, violation, excludeCaseId = null }) {
  const params = [studentId];
  let excludeClause = "";

  if (excludeCaseId) {
    excludeClause = "AND id <> ?";
    params.push(excludeCaseId);
  }

  const [allRows] = await pool.query(
    `
    SELECT id, case_number, violation_type, severity_level, status, incident_date
    FROM cases
    WHERE student_id = ?
    ${excludeClause}
    ORDER BY incident_date DESC, created_at DESC
    LIMIT 8
    `,
    params
  );

  const target = String(violation || "").trim().toLowerCase();
  const similar = allRows.filter(row => String(row.violation_type || "").trim().toLowerCase() === target);

  return {
    total_previous: allRows.length,
    similar_previous: similar.length,
    recent_cases: allRows,
    similar_cases: similar
  };
}

async function getClosureReadiness(caseId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.status,
      c.review_status,
      c.assigned_to_user_id,
      (SELECT COUNT(*) FROM case_evidence WHERE case_id = c.id AND review_status = 'pending') AS pending_evidence,
      (SELECT COUNT(*) FROM hearings WHERE case_id = c.id AND status = 'scheduled') AS pending_hearings,
      (SELECT COUNT(*) FROM hearings WHERE case_id = c.id AND status = 'completed') AS completed_hearings,
      (SELECT COUNT(*) FROM sanctions WHERE case_id = c.id) AS sanctions_total,
      (SELECT COUNT(*) FROM appeals WHERE case_id = c.id AND status IN ('submitted', 'under_review')) AS active_appeals,
      (SELECT COUNT(*) FROM counselor_interventions WHERE case_id = c.id AND status IN ('planned', 'ongoing')) AS active_counseling
    FROM cases c
    WHERE c.id = ?
    LIMIT 1
    `,
    [caseId]
  );

  if (!rows.length) {
    return null;
  }

  const item = rows[0];
  const checks = [
    {
      key: "review",
      label: "Report review complete",
      complete: ["validated", "duplicate"].includes(item.review_status)
    },
    {
      key: "owner",
      label: "Case owner assigned",
      complete: Boolean(item.assigned_to_user_id) || item.status === "dismissed"
    },
    {
      key: "evidence",
      label: "Evidence review complete",
      complete: Number(item.pending_evidence) === 0
    },
    {
      key: "hearing",
      label: "No scheduled hearing waiting for result",
      complete: Number(item.pending_hearings) === 0
    },
    {
      key: "appeal",
      label: "No active appeal waiting for decision",
      complete: Number(item.active_appeals) === 0
    },
    {
      key: "counseling",
      label: "Counseling follow-up is not active",
      complete: Number(item.active_counseling) === 0
    }
  ];

  return {
    checks,
    ready: checks.every(check => check.complete),
    missing: checks.filter(check => !check.complete).map(check => check.label)
  };
}

async function getCaseProcessAudit(caseId) {
  const snapshot = await getWorkflowSnapshot(caseId);
  if (!snapshot) {
    return null;
  }

  const item = snapshot.case;
  const counts = snapshot.counts;
  const acknowledgements = await getAcknowledgements(caseId);
  const events = await getWorkflowEvents(caseId);
  const eventTypes = new Set(events.map(event => event.event_type));
  const studentAck = acknowledgements.some(ack => ack.role === "student");
  const parentAck = acknowledgements.some(ack => ack.role === "parent");
  const isClosed = isClosedStatus(item.status);
  const evidenceOrReason = Number(counts.evidence_total) > 0 || Boolean(item.evidence_unavailable_reason);
  const isMajorReport = ["major", "grave"].includes(String(item.severity_level || "").toLowerCase());
  const hasDecisionOrOpenInvestigation = Number(counts.decisions_total) > 0 || !isClosed;
  const slaOverdue = counts.sla_max_hours && Number(counts.hours_since_update) > Number(counts.sla_max_hours);

  const checks = [
    {
      key: "report_completeness",
      label: "Report completeness score",
      status: Number(item.report_completeness_score || 0) >= 70 ? "complete" : "warning",
      detail: `Report completeness is ${Number(item.report_completeness_score || 0)}%.`
    },
    {
      key: "required_evidence_policy",
      label: "Required evidence policy",
      status: !isMajorReport || evidenceOrReason ? "complete" : "blocked",
      detail: isMajorReport && !evidenceOrReason ? "Major/grave case needs evidence or a written unavailable-evidence reason." : "Evidence requirement has a file or documented reason."
    },
    {
      key: "report_review",
      label: "Report review decision",
      status: item.review_status && item.review_status !== "pending_review" ? "complete" : "blocked",
      detail: item.review_status === "pending_review" ? "Report is still waiting for validation." : `Marked ${labelize(item.review_status)}.`
    },
    {
      key: "duplicate_resolution",
      label: "Duplicate resolution",
      status: item.review_status !== "duplicate" || item.duplicate_of_case_id || isClosed ? "complete" : "blocked",
      detail: item.review_status === "duplicate" && !item.duplicate_of_case_id ? "Duplicate case has no original case reference." : "No unresolved duplicate gap."
    },
    {
      key: "ownership",
      label: "Clear case owner",
      status: item.assigned_to_user_id || isClosed ? "complete" : "blocked",
      detail: item.assigned_to_user_id ? "Case has an assigned owner." : "Case is unassigned."
    },
    {
      key: "next_action",
      label: "Next required action",
      status: item.next_action ? "complete" : "blocked",
      detail: item.next_action ? workflowMessage(item.next_action) : "No next action is set."
    },
    {
      key: "evidence_review",
      label: "Evidence review",
      status: Number(counts.evidence_pending) === 0 ? "complete" : "blocked",
      detail: Number(counts.evidence_pending) ? `${counts.evidence_pending} evidence file(s) still pending review.` : "No pending evidence review."
    },
    {
      key: "evidence_metadata",
      label: "Evidence category and purpose",
      status: Number(counts.evidence_missing_metadata) === 0 ? "complete" : "warning",
      detail: Number(counts.evidence_missing_metadata) ? `${counts.evidence_missing_metadata} evidence file(s) need category or purpose.` : "Evidence metadata is complete."
    },
    {
      key: "witnesses_involved",
      label: "Witnesses/involved persons",
      status: Number(counts.witnesses_total) > 0 || isClosed ? "complete" : "warning",
      detail: Number(counts.witnesses_total) ? `${counts.witnesses_total} witness/involved person record(s).` : "No witness or involved-person record yet."
    },
    {
      key: "student_statement",
      label: "Student statement",
      status: Number(counts.student_statements) > 0 || isClosed ? "complete" : "warning",
      detail: Number(counts.student_statements) ? "Student statement is recorded." : "Student response is not recorded yet."
    },
    {
      key: "parent_response",
      label: "Parent response",
      status: Number(counts.parent_statements) > 0 || isClosed ? "complete" : "warning",
      detail: Number(counts.parent_statements) ? "Parent response is recorded." : "Parent response is not recorded yet."
    },
    {
      key: "hearing_result",
      label: "Hearing outcome",
      status: Number(counts.hearings_scheduled) === 0 ? "complete" : "blocked",
      detail: Number(counts.hearings_scheduled) ? "A scheduled hearing still needs result entry." : "No hearing result gap."
    },
    {
      key: "hearing_attendance",
      label: "Hearing participants and attendance",
      status: Number(counts.completed_hearings_missing_attendance) === 0 ? "complete" : "blocked",
      detail: Number(counts.completed_hearings_missing_attendance) ? "A completed hearing has no attendance record." : "No hearing attendance gap."
    },
    {
      key: "policy_reference",
      label: "Policy/rule reference",
      status: Number(counts.policy_refs_total) > 0 || Boolean(item.policy_basis_summary) || !hasDecisionOrOpenInvestigation ? "complete" : "warning",
      detail: Number(counts.policy_refs_total) ? `${counts.policy_refs_total} policy reference(s) recorded.` : "No policy or rule basis is linked yet."
    },
    {
      key: "formal_decision",
      label: "Formal decision record",
      status: Number(counts.decisions_total) > 0 || !isClosed ? "warning" : "blocked",
      detail: Number(counts.decisions_total) ? `${counts.decisions_total} formal decision record(s).` : "No formal decision record yet."
    },
    {
      key: "decision_approval",
      label: "Approval/sign-off",
      status: Number(counts.pending_decision_approvals) === 0 ? "complete" : "blocked",
      detail: Number(counts.pending_decision_approvals) ? `${counts.pending_decision_approvals} decision(s) still need approval.` : "No pending approval gap."
    },
    {
      key: "sanction_recommendation",
      label: "Sanction recommendation",
      status: Number(counts.sanction_recommended) === 0 || Number(counts.sanctions_total) > 0 ? "complete" : "blocked",
      detail: Number(counts.sanction_recommended) > 0 && Number(counts.sanctions_total) === 0 ? "Hearing recommended sanction but no sanction was issued." : "No unresolved sanction recommendation."
    },
    {
      key: "counseling_follow_up",
      label: "Counseling follow-up",
      status: Number(counts.counseling_recommended) === 0 || Number(counts.counselor_actions) > 0 ? "complete" : "blocked",
      detail: Number(counts.counseling_recommended) > 0 && Number(counts.counselor_actions) === 0 ? "Hearing recommended counseling but no counselor follow-up exists." : "No unresolved counseling recommendation."
    },
    {
      key: "appeal_review",
      label: "Appeal review",
      status: Number(counts.active_appeals) === 0 ? "complete" : "blocked",
      detail: Number(counts.active_appeals) ? `${counts.active_appeals} active appeal(s) need decision.` : "No active appeal gap."
    },
    {
      key: "appeal_deadline",
      label: "Appeal deadline/eligibility",
      status: Number(counts.decisions_total) === 0 || item.appeal_deadline_at ? "complete" : "warning",
      detail: item.appeal_deadline_at ? `Appeal deadline is ${item.appeal_deadline_at}.` : "No appeal deadline is set after decision."
    },
    {
      key: "sanction_completion_proof",
      label: "Sanction completion proof",
      status: Number(counts.fulfilled_sanctions_missing_proof) === 0 ? "complete" : "warning",
      detail: Number(counts.fulfilled_sanctions_missing_proof) ? "A fulfilled sanction is missing completion notes/proof." : "No sanction completion proof gap."
    },
    {
      key: "sla_aging",
      label: "SLA/aging warning",
      status: slaOverdue ? "warning" : "complete",
      detail: slaOverdue ? `${labelize(item.next_action)} has waited ${counts.hours_since_update} hour(s), above the ${counts.sla_max_hours}-hour SLA.` : "No SLA aging warning."
    },
    {
      key: "escalation",
      label: "Escalation rules",
      status: !slaOverdue || item.escalation_level !== "none" || item.last_escalated_at ? "complete" : "warning",
      detail: slaOverdue && item.escalation_level === "none" && !item.last_escalated_at ? "Overdue case has not been escalated yet." : "No escalation gap."
    },
    {
      key: "notice_acknowledgement",
      label: "Student/parent acknowledgement",
      status: studentAck && parentAck ? "complete" : (studentAck || parentAck ? "warning" : "warning"),
      detail: `Student: ${studentAck ? "acknowledged" : "missing"}, Parent: ${parentAck ? "acknowledged" : "missing"}.`
    },
    {
      key: "workflow_timeline",
      label: "Procedure timeline",
      status: eventTypes.has("reported") || events.length ? "complete" : "warning",
      detail: events.length ? `${events.length} workflow event(s) recorded.` : "No workflow events are recorded."
    },
    {
      key: "closure",
      label: "Closure requirements",
      status: isClosed ? (item.closure_notes ? "complete" : "warning") : "warning",
      detail: isClosed ? (item.closure_notes ? "Closed with final notes." : "Closed but final notes are missing.") : "Case is still open."
    },
    {
      key: "final_packet",
      label: "Final case packet",
      status: !isClosed || Number(counts.packet_exports_total) > 0 ? "complete" : "warning",
      detail: Number(counts.packet_exports_total) ? "Final case packet has been generated." : "Closed case has no exported final packet yet."
    }
  ];

  const blocked = checks.filter(check => check.status === "blocked");
  const warnings = checks.filter(check => check.status === "warning");

  return {
    case_id: item.id,
    case_number: item.case_number,
    status: blocked.length ? "blocked" : (warnings.length ? "warning" : "complete"),
    score: checks.length ? Math.round(((checks.length - blocked.length - warnings.length * 0.5) / checks.length) * 100) : 100,
    blocked_count: blocked.length,
    warning_count: warnings.length,
    missing: blocked.map(check => check.label),
    warnings: warnings.map(check => check.label),
    checks
  };
}

module.exports = {
  REVIEW_STATUSES,
  acknowledgeCase,
  createWorkflowEvent,
  getAcknowledgements,
  getClosureReadiness,
  getCaseProcessAudit,
  getRepeatViolationSummary,
  getWorkflowEvents,
  labelize,
  notifyCaseStakeholders,
  refreshCaseWorkflow,
  workflowMessage
};
