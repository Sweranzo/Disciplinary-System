const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { sendSms, isSmsEnabled, renderSmsTemplate } = require("../utils/smsService");
const { sendStudentEmail, sendParentEmail } = require("../utils/emailService");
const { generateQrDataUrl } = require("../utils/identityService");
const {
  REVIEW_STATUSES,
  acknowledgeCase,
  createWorkflowEvent,
  getAcknowledgements,
  getCaseProcessAudit,
  getClosureReadiness,
  getRepeatViolationSummary,
  getWorkflowEvents,
  labelize,
  notifyCaseStakeholders,
  refreshCaseWorkflow
} = require("../utils/caseWorkflow");
const { buildPublicUrl } = require("../utils/publicUrl");

const ADMINISTRATIVE_DISMISSAL_REASONS = Object.freeze({
  student_inactive: "Student inactive",
  unresponsive_after_followups: "Unresponsive or non-cooperative after documented follow-ups",
  withdrawn_or_transferred: "Student withdrawn or transferred",
  duplicate_or_invalid_report: "Duplicate or invalid report",
  insufficient_basis: "Insufficient basis to continue",
  other_administrative_reason: "Other administrative reason"
});

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

  return buildPublicUrl(avatarPath);
}

async function notifyLinkedParentsAboutCase({
  caseId,
  caseNumber,
  student,
  violation,
  incidentDate,
  location,
  actorUserId = null,
  ipAddress = null
}) {
  const [parentRows] = await pool.query(
    `
    SELECT
      p.id AS parent_id,
      p.phone_number,
      p.email AS parent_email,
      p.first_name AS profile_first_name,
      p.last_name AS profile_last_name,
      pu.id AS parent_user_id,
      pu.email AS account_email,
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
      smsAttemptCount: 0,
      smsSentCount: 0,
      smsFailedCount: 0,
      smsDisabledCount: 0,
      parentEmailAttemptCount: 0,
      parentEmailSentCount: 0,
      parentEmailFailedCount: 0,
      parentEmailDisabledCount: 0,
      smsEnabled: isSmsEnabled()
    };
  }

  const studentName = `${student.first_name} ${student.last_name}`.trim();
  let notifiedParents = 0;
  let smsAttemptCount = 0;
  let smsSentCount = 0;
  let smsFailedCount = 0;
  let smsDisabledCount = 0;
  let parentEmailAttemptCount = 0;
  let parentEmailSentCount = 0;
  let parentEmailFailedCount = 0;
  let parentEmailDisabledCount = 0;

  for (const parent of parentRows) {
    const parentName = `${parent.account_first_name || parent.profile_first_name || "Parent"} ${parent.account_last_name || parent.profile_last_name || ""}`.trim();
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
      message: renderSmsTemplate("caseReport", {
        parentName,
        caseNumber,
        studentName,
        violation,
        incidentDate,
        location: location || "",
        locationSentence: location ? ` Location: ${location}.` : ""
      }),
      userId: actorUserId,
      ipAddress
    });

    smsAttemptCount += 1;
    if (smsResult.success) {
      smsSentCount += 1;
    } else if (smsResult.status === "disabled") {
      smsDisabledCount += 1;
    } else {
      smsFailedCount += 1;
    }

    const emailResult = await sendParentEmail({
      caseId,
      parent,
      subject: `New Case Report for ${studentName}: ${caseNumber}`,
      message:
        `Dear ${parentName},\n\n`
        + `A disciplinary case (${caseNumber}) was reported for ${studentName} regarding ${violation} on ${incidentDate}.`
        + `${location ? ` Location: ${location}.` : ""}\n\n`
        + "Please log in to the parent portal or contact the school office for details.\n\n"
        + "Philtech-GMA Disciplinary Office"
    });

    parentEmailAttemptCount += 1;
    if (emailResult.success) {
      parentEmailSentCount += 1;
    } else if (emailResult.status === "disabled") {
      parentEmailDisabledCount += 1;
    } else {
      parentEmailFailedCount += 1;
    }

  }

  return {
    notifiedParents,
    smsAttemptCount,
    smsSentCount,
    smsFailedCount,
    smsDisabledCount,
    parentEmailAttemptCount,
    parentEmailSentCount,
    parentEmailFailedCount,
    parentEmailDisabledCount,
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

  if (query.status === "hearing_overdue") {
    clause += `
      AND c.status NOT IN ('resolved', 'dismissed')
      AND EXISTS (
        SELECT 1
        FROM hearings overdue_hearing
        WHERE overdue_hearing.case_id = c.id
          AND overdue_hearing.status = 'scheduled'
          AND TIMESTAMP(
            overdue_hearing.scheduled_date,
            COALESCE(overdue_hearing.scheduled_time, '23:59:59')
          ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
      )
    `;
  } else if (query.status) {
    clause += " AND c.status = ?";
    params.push(query.status);
  } else if (query.activeOnly === "true") {
    clause += " AND c.status NOT IN ('resolved', 'dismissed')";
  }

  if (query.reviewStatus) {
    clause += " AND c.review_status = ?";
    params.push(query.reviewStatus);
  }

  if (query.workflowStatus) {
    clause += " AND c.workflow_status = ?";
    params.push(query.workflowStatus);
  }

  if (query.nextAction) {
    clause += " AND c.next_action = ?";
    params.push(query.nextAction);
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

function addOperationalCaseStatus(item) {
  const hasOverdueHearing = Number(item.has_overdue_hearing) === 1;
  return {
    ...item,
    has_overdue_hearing: hasOverdueHearing,
    operational_status: hasOverdueHearing ? "hearing_overdue" : item.status,
    operational_status_label: hasOverdueHearing ? "Hearing Overdue" : labelize(item.status)
  };
}

function getReportCompletenessScore(payload = {}) {
  const severity = String(payload.severity || payload.severityLevel || "").toLowerCase();
  const hasEvidencePath = Boolean(payload.hasEvidence || payload.evidenceCount || payload.evidenceUnavailableReason);
  const checks = [
    Boolean(payload.studentNumber || payload.studentId),
    Boolean(payload.violation || payload.violationType),
    Boolean(payload.severity || payload.severityLevel),
    Boolean(payload.date || payload.incidentDate),
    Boolean(payload.location),
    String(payload.description || "").trim().length >= 40,
    hasEvidencePath
  ];

  if (["major", "grave"].includes(severity)) {
    checks.push(hasEvidencePath);
  }

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function isFutureDate(dateValue) {
  const incidentDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(incidentDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return incidentDate > today;
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

async function requireCaseMutationAccess(caseId, user) {
  if (user.role === "admin") {
    return { allowed: true };
  }

  if (user.role !== "discipline_officer") {
    return { allowed: true };
  }

  const [rows] = await pool.query(
    `
    SELECT assigned_to_user_id
    FROM cases
    WHERE id = ?
    LIMIT 1
    `,
    [caseId]
  );

  if (!rows.length) {
    return { allowed: false, status: 404, message: "Case not found." };
  }

  if (Number(rows[0].assigned_to_user_id) === Number(user.id)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    message: "Claim this case before making changes."
  };
}

async function createCase(req, res) {
  try {
    const { studentNumber, violation, severity, date, time, location, description, evidenceUnavailableReason } = req.body;

    if (!studentNumber || !violation || !severity || !date || !description) {
      return res.status(400).json({
        success: false,
        message: "Student number, violation, severity, date, and description are required."
      });
    }

    if (isFutureDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Incident date cannot be in the future."
      });
    }

    if (time && !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
      return res.status(400).json({
        success: false,
        message: "Incident time must use HH:MM format."
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
    s.email AS student_email,
    u.email AS account_email,
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
        incident_time,
        location,
        description,
        evidence_unavailable_reason,
        report_completeness_score,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        caseNumber,
        student.student_id,
        req.user.id,
        violation,
        severity,
        date,
        time || null,
        location || null,
        description,
        evidenceUnavailableReason || null,
        getReportCompletenessScore(req.body)
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

    await createWorkflowEvent({
      caseId: result.insertId,
      userId: req.user.id,
      eventType: "reported",
      title: "Violation report submitted",
      details: `${caseNumber} was reported for student ${student.student_number}.`,
      metadata: { violation, severity, incidentDate: date }
    });

    const repeatSummary = await getRepeatViolationSummary({
      studentId: student.student_id,
      violation,
      excludeCaseId: result.insertId
    });

    await refreshCaseWorkflow(result.insertId);

    const [reviewerRows] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE status = 'active'
        AND role IN ('admin', 'discipline_officer')
        AND id <> ?
      `,
      [req.user.id]
    );

    for (const reviewer of reviewerRows) {
      await createNotification(
        reviewer.id,
        "Case Report Needs Review",
        `${caseNumber} was submitted and needs review before assignment.`,
        "case"
      );
    }

    const incidentTimeText = time ? ` at ${time}` : "";

    if (student.student_user_id) {
      await createNotification(
        student.student_user_id,
        "New Disciplinary Case Recorded",
        `A disciplinary case (${caseNumber}) has been recorded for you regarding ${violation} on ${date}${incidentTimeText}.`,
        "case"
      );
    }

    await sendStudentEmail({
      caseId: result.insertId,
      student,
      subject: `Disciplinary Case Notice: ${caseNumber}`,
      message:
        `Dear ${student.first_name},\n\n`
        + `A disciplinary case (${caseNumber}) has been recorded for you regarding ${violation} on ${date}${incidentTimeText}.`
        + `${location ? ` Location: ${location}.` : ""}\n\n`
        + "Please log in to the student portal to review the case details and wait for further guidance from the school office.\n\n"
        + "Philtech-GMA Disciplinary Office"
    });

    let parentNotificationSummary = {
      notifiedParents: 0,
      smsAttemptCount: 0,
      smsSentCount: 0,
      smsFailedCount: 0,
      smsDisabledCount: 0,
      parentEmailAttemptCount: 0,
      parentEmailSentCount: 0,
      parentEmailFailedCount: 0,
      parentEmailDisabledCount: 0,
      smsEnabled: isSmsEnabled()
    };

    if (req.user.role === "teacher") {
      parentNotificationSummary = await notifyLinkedParentsAboutCase({
        caseId: result.insertId,
        caseNumber,
        student,
        violation,
        incidentDate: `${date}${incidentTimeText}`,
        location,
        actorUserId: req.user.id,
        ipAddress: req.ip
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
        incident_time: time || null,
        location: location || null,
        description,
        status: "pending",
        review_status: "pending_review",
        workflow_status: "review",
        next_action: "review_report",
        next_action_label: "Review Report",
        next_action_notes: "Review the teacher report and mark it valid, incomplete, duplicate, or needing evidence.",
        repeat_warning: repeatSummary
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
        c.review_status,
        c.workflow_status,
        c.next_action,
        c.next_action_notes,
        c.duplicate_of_case_id,
        c.assigned_to_user_id,
        c.incident_date,
        c.incident_time,
        c.location,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        s.student_number,
        reporter.first_name AS reported_by_first_name,
        reporter.last_name AS reported_by_last_name,
        assignee.first_name AS assigned_to_first_name,
        assignee.last_name AS assigned_to_last_name,
        assignee.role AS assigned_to_role,
        EXISTS (
          SELECT 1
          FROM hearings overdue_hearing
          WHERE overdue_hearing.case_id = c.id
            AND overdue_hearing.status = 'scheduled'
            AND TIMESTAMP(
              overdue_hearing.scheduled_date,
              COALESCE(overdue_hearing.scheduled_time, '23:59:59')
            ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing,
        (
          SELECT DATE_FORMAT(next_hearing.scheduled_date, '%Y-%m-%d')
          FROM hearings next_hearing
          WHERE next_hearing.case_id = c.id
            AND next_hearing.status = 'scheduled'
          ORDER BY next_hearing.scheduled_date ASC, next_hearing.scheduled_time ASC
          LIMIT 1
        ) AS scheduled_hearing_date,
        (
          SELECT next_hearing.scheduled_time
          FROM hearings next_hearing
          WHERE next_hearing.case_id = c.id
            AND next_hearing.status = 'scheduled'
          ORDER BY next_hearing.scheduled_date ASC, next_hearing.scheduled_time ASC
          LIMIT 1
        ) AS scheduled_hearing_time
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
        assigned_to_role_label: formatRoleLabel(item.assigned_to_role),
        review_status_label: labelize(item.review_status),
        workflow_status_label: labelize(item.workflow_status),
        operational_status: Number(item.has_overdue_hearing) ? "hearing_overdue" : item.status,
        operational_status_label: Number(item.has_overdue_hearing) ? "Hearing Overdue" : labelize(item.status),
        operational_next_action: Number(item.has_overdue_hearing) ? "update_hearing_result" : item.next_action,
        next_action_label: Number(item.has_overdue_hearing) ? "Update Hearing Result" : labelize(item.next_action),
        owner_label: item.assigned_to_first_name
          ? `${item.assigned_to_first_name} ${item.assigned_to_last_name || ""}`.trim()
          : "Unassigned"
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
        c.review_status,
        c.workflow_status,
        c.next_action,
        c.next_action_notes,
        c.duplicate_of_case_id,
        c.closed_by_user_id,
        c.closed_at,
        c.closure_notes,
        c.hearing_required,
        c.parent_notified,
        c.reported_by_user_id,
        c.assigned_to_user_id,
        EXISTS (
          SELECT 1
          FROM hearings overdue_hearing
          WHERE overdue_hearing.case_id = c.id
            AND overdue_hearing.status = 'scheduled'
            AND TIMESTAMP(
              overdue_hearing.scheduled_date,
              COALESCE(overdue_hearing.scheduled_time, '23:59:59')
            ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing,
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
          assignee.role AS assigned_to_role,
          duplicate.case_number AS duplicate_case_number,
          closer.first_name AS closed_by_first_name,
          closer.last_name AS closed_by_last_name,
          closer.role AS closed_by_role
        FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN users reporter ON c.reported_by_user_id = reporter.id
      LEFT JOIN users assignee ON c.assigned_to_user_id = assignee.id
      LEFT JOIN cases duplicate ON c.duplicate_of_case_id = duplicate.id
      LEFT JOIN users closer ON c.closed_by_user_id = closer.id
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

      const caseData = addOperationalCaseStatus({
        ...rows[0],
        student_avatar_url: buildAvatarUrl(rows[0].student_avatar_path),
        student_qr_code_data_url: studentQrCodeDataUrl,
        reported_by_role_label: formatRoleLabel(rows[0].reported_by_role),
        assigned_to_role_label: formatRoleLabel(rows[0].assigned_to_role),
        closed_by_role_label: formatRoleLabel(rows[0].closed_by_role),
        review_status_label: labelize(rows[0].review_status),
        workflow_status_label: labelize(rows[0].workflow_status),
        next_action_label: labelize(rows[0].next_action),
        owner_label: rows[0].assigned_to_first_name
          ? `${rows[0].assigned_to_first_name} ${rows[0].assigned_to_last_name || ""}`.trim()
          : "Unassigned",
        is_closed: isCaseClosed(rows[0].status)
      });

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
        ce.evidence_category,
        ce.evidence_purpose,
        ce.source_label,
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
          DATE_FORMAT(h.scheduled_date, '%Y-%m-%d') AS scheduled_date,
          h.scheduled_time,
          h.location,
          h.outcome,
          h.finding,
          h.recommendation,
          h.result_recorded_at,
          h.status,
          (
            h.status = 'scheduled'
            AND TIMESTAMP(h.scheduled_date, COALESCE(h.scheduled_time, '23:59:59'))
              < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
          ) AS has_overdue_hearing,
          h.created_at,
          creator.first_name AS created_by_first_name,
          creator.last_name AS created_by_last_name,
          creator.role AS created_by_role,
          result_recorder.first_name AS result_recorded_by_first_name,
          result_recorder.last_name AS result_recorded_by_last_name,
          result_recorder.role AS result_recorded_by_role
        FROM hearings h
        JOIN users creator ON h.created_by_user_id = creator.id
        LEFT JOIN users result_recorder ON h.result_recorded_by_user_id = result_recorder.id
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

      const workflow = await refreshCaseWorkflow(id);
      if (workflow) {
        caseData.workflow_status = workflow.workflow_status;
        caseData.workflow_status_label = labelize(workflow.workflow_status);
        caseData.next_action = workflow.next_action;
        caseData.next_action_label = workflow.next_action_label;
        caseData.next_action_notes = workflow.next_action_notes;
      }

      const acknowledgements = await getAcknowledgements(id);
      const workflowEvents = await getWorkflowEvents(id);
      const closureReadiness = await getClosureReadiness(id);
      const repeatWarning = await getRepeatViolationSummary({
        studentId: rows[0].student_id,
        violation: rows[0].violation_type,
        excludeCaseId: id
      });

      return res.json({
        success: true,
        case: caseData,
        timeline: {
          workflowEvents,
          acknowledgements,
          closureReadiness,
          updates: updates.map(item => ({ ...item, role_label: formatRoleLabel(item.role) })),
          evidence: evidence.map(item => ({
            ...item,
            uploaded_by_role_label: formatRoleLabel(item.uploaded_by_role),
            reviewed_by_role_label: formatRoleLabel(item.reviewed_by_role)
          })),
          hearings: hearings.map(item => ({
            ...item,
            has_overdue_hearing: Number(item.has_overdue_hearing) === 1,
            operational_status: Number(item.has_overdue_hearing) === 1 ? "hearing_overdue" : item.status,
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
        },
        acknowledgements,
        closure_readiness: closureReadiness,
        repeat_warning: repeatWarning
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

      const mutationAccess = await requireCaseMutationAccess(id, req.user);
      if (!mutationAccess.allowed) {
        return res.status(mutationAccess.status).json({
          success: false,
          message: mutationAccess.message
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

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "case_update",
      title: "Case update added",
      details: `${labelize(finalType)}: ${content}`
    });

    const workflow = await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Update Added",
      message: `${caseItem.case_number} has a new ${labelize(finalType)} update: ${content}`,
      excludeUserId: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Case update added successfully.",
      workflow
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

    if (!reopeningClosedCase) {
      return res.status(400).json({
        success: false,
        message: "Case status is automated. Use workflow actions such as claim, schedule hearing, record result, or close case."
      });
    }

    if (status !== "under_investigation") {
      return res.status(400).json({
        success: false,
        message: "Closed cases can only be reopened to under investigation."
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

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "status_change",
      title: "Case status changed",
      details: `Status changed from ${labelize(currentStatus)} to ${labelize(status)}.`
    });

    const workflow = await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Reopened",
      message: `${caseRows[0].case_number} was reopened and is under investigation again.`,
      excludeUserId: req.user.id
    });

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
        : "Case status updated successfully.",
      workflow
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

    if (req.user.role === "discipline_officer") {
      return res.status(403).json({
        success: false,
        message: "Use Claim Case to take ownership before working on a case."
      });
    }

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
      SET
        assigned_to_user_id = ?,
        status = CASE
          WHEN status = 'pending' THEN 'under_investigation'
          ELSE status
        END
      WHERE id = ?
      `,
      [assignedToUserId, id]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "assignment",
      title: "Case owner assigned",
      details: `${caseRows[0].case_number} assigned to ${assignee.first_name} ${assignee.last_name} (${formatRoleLabel(assignee.role)}).`
    });

    const workflow = await refreshCaseWorkflow(id);

    if (Number(assignee.id) !== Number(req.user.id)) {
      await createNotification(
        assignee.id,
        "Case Assignment",
        `You have been assigned to handle case ${caseRows[0].case_number}.`,
        "case"
      );
    }

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Investigation Assigned",
      message: `${caseRows[0].case_number} is now assigned to ${assignee.first_name} ${assignee.last_name}. Current status: ${labelize(caseRows[0].status === "pending" ? "under_investigation" : caseRows[0].status)}.`,
      includeStudentParents: true,
      includeStaff: false,
      excludeUserId: req.user.id
    });

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
      message: "Case assigned successfully.",
      workflow
    });
  } catch (error) {
    console.error("Assign case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while assigning case."
    });
  }
}

async function reviewCaseReport(req, res) {
  try {
    const { id } = req.params;
    const { reviewStatus, notes, duplicateOfCaseId } = req.body;
    const finalReviewStatus = String(reviewStatus || "").trim();
    const duplicateReference = String(duplicateOfCaseId || "").trim();
    let resolvedDuplicateCaseId = null;

    if (!REVIEW_STATUSES.includes(finalReviewStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review status."
      });
    }

    if (finalReviewStatus === "pending_review") {
      return res.status(400).json({
        success: false,
        message: "Select a final report review decision."
      });
    }

    const [caseRows] = await pool.query(
      `SELECT id, case_number, status, review_status FROM cases WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!caseRows.length) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    if (isCaseClosed(caseRows[0].status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    if (caseRows[0].review_status !== "pending_review") {
      return res.status(409).json({
        success: false,
        message: `This report was already reviewed as ${labelize(caseRows[0].review_status)}. Review decisions are final.`
      });
    }

    const mutationAccess = await requireCaseMutationAccess(id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    if (finalReviewStatus === "duplicate") {
      if (!duplicateReference) {
        return res.status(400).json({
          success: false,
          message: "Select the original case before marking this report as duplicate."
        });
      }

      const [duplicateRows] = await pool.query(
        `SELECT id FROM cases WHERE (id = ? OR case_number = ?) AND id <> ? LIMIT 1`,
        [duplicateReference, duplicateReference, id]
      );
      if (!duplicateRows.length) {
        return res.status(400).json({
          success: false,
          message: "Duplicate reference case was not found."
        });
      }
      resolvedDuplicateCaseId = duplicateRows[0].id;
    }

    const [reviewUpdate] = await pool.query(
      `
      UPDATE cases
      SET review_status = ?, duplicate_of_case_id = ?, next_action_notes = ?
      WHERE id = ? AND review_status = 'pending_review'
      `,
      [
        finalReviewStatus,
        finalReviewStatus === "duplicate" ? resolvedDuplicateCaseId : null,
        notes || null,
        id
      ]
    );

    if (!reviewUpdate.affectedRows) {
      return res.status(409).json({
        success: false,
        message: "This report has already been reviewed. Refresh the case to see the final decision."
      });
    }

    await pool.query(
      `
      INSERT INTO case_updates (case_id, updated_by_user_id, update_type, content)
      VALUES (?, ?, 'status_change', ?)
      `,
      [id, req.user.id, `Report review marked as ${labelize(finalReviewStatus)}.${notes ? ` ${notes}` : ""}`]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "review",
      title: "Report review completed",
      details: `Review status: ${labelize(finalReviewStatus)}.${notes ? ` ${notes}` : ""}`,
      metadata: {
        reviewStatus: finalReviewStatus,
        duplicateOfCaseId: resolvedDuplicateCaseId,
        notes: String(notes || "").trim()
      }
    });

    const workflow = await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Review Updated",
      message: `${caseRows[0].case_number} was marked ${labelize(finalReviewStatus)}. Next action: ${workflow?.next_action_label || "Review"}.`,
      excludeUserId: req.user.id
    });

    await logAudit({
      userId: req.user.id,
      action: "REVIEW_CASE_REPORT",
      targetTable: "cases",
      targetId: Number(id),
      details: `Reviewed ${caseRows[0].case_number} as ${finalReviewStatus}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Case report review saved.",
      workflow
    });
  } catch (error) {
    console.error("Review case report error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reviewing case report."
    });
  }
}

async function closeCaseWithChecklist(req, res) {
  try {
    const { id } = req.params;
    const { finalStatus, closureNotes, checklist = {}, dismissalReason } = req.body;
    const status = ["resolved", "dismissed"].includes(finalStatus) ? finalStatus : "";
    const normalizedDismissalReason = String(dismissalReason || "").trim();
    const dismissalReasonLabel = ADMINISTRATIVE_DISMISSAL_REASONS[normalizedDismissalReason] || "";
    const isAdministrativeDismissal = status === "dismissed" && Boolean(dismissalReasonLabel);

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Final status must be resolved or dismissed."
      });
    }

    if (!closureNotes || String(closureNotes).trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Final closure notes are required."
      });
    }

    if (status === "dismissed" && req.user.role === "discipline_officer" && !isAdministrativeDismissal) {
      return res.status(400).json({
        success: false,
        message: "Select a valid administrative dismissal reason."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.status,
        c.review_status,
        c.assigned_to_user_id,
        (SELECT COUNT(*) FROM case_evidence WHERE case_id = c.id AND review_status = 'pending') AS pending_evidence,
        (SELECT COUNT(*) FROM hearings WHERE case_id = c.id AND status = 'scheduled') AS pending_hearings
      FROM cases c
      WHERE c.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!caseRows.length) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    const mutationAccess = await requireCaseMutationAccess(id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    const item = caseRows[0];
    if (isCaseClosed(item.status)) {
      return res.status(400).json({
        success: false,
        message: "Resolved or dismissed cases are read-only."
      });
    }

    const missing = [];
    if (!["validated", "duplicate"].includes(item.review_status)) missing.push("review");
    if (!item.assigned_to_user_id && status === "resolved") missing.push("owner");
    if (Number(item.pending_evidence) > 0) missing.push("evidence review");
    if (Number(item.pending_hearings) > 0) missing.push("hearing result");

    const adminOverride = req.user.role === "admin" && checklist.override === true;
    if (missing.length && !isAdministrativeDismissal && !adminOverride) {
      return res.status(400).json({
        success: false,
        message: `Closure checklist is incomplete: ${missing.join(", ")}.`
      });
    }

    const trimmedClosureNotes = String(closureNotes).trim();
    const storedClosureNotes = isAdministrativeDismissal
      ? `Dismissal reason: ${dismissalReasonLabel}. ${trimmedClosureNotes}`
      : trimmedClosureNotes;

    await pool.query(
      `
      UPDATE cases
      SET status = ?, workflow_status = 'closed', next_action = 'closed',
          next_action_notes = ?,
          closed_by_user_id = ?, closed_at = CURRENT_TIMESTAMP, closure_notes = ?
      WHERE id = ?
      `,
      [
        status,
        status === "dismissed" ? `Case dismissed: ${dismissalReasonLabel || "Administrative closure"}.` : "No further action is required.",
        req.user.id,
        storedClosureNotes,
        id
      ]
    );

    if (status === "dismissed") {
      await pool.query(
        `
        UPDATE hearings
        SET status = 'cancelled',
            outcome = CASE
              WHEN outcome IS NULL OR TRIM(outcome) = ''
                THEN ?
              ELSE outcome
            END
        WHERE case_id = ? AND status = 'scheduled'
        `,
        [`Cancelled because the case was dismissed. ${dismissalReasonLabel || trimmedClosureNotes}`, id]
      );
    }

    await pool.query(
      `
      INSERT INTO case_updates (case_id, updated_by_user_id, update_type, content)
      VALUES (?, ?, 'status_change', ?)
      `,
      [
        id,
        req.user.id,
        isAdministrativeDismissal
          ? `Case dismissed administratively. Reason: ${dismissalReasonLabel}. ${trimmedClosureNotes}`
          : `Case closed as ${labelize(status)}. ${trimmedClosureNotes}`
      ]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "closure",
      title: "Case closed",
      details: isAdministrativeDismissal
        ? `${item.case_number} was dismissed administratively. Reason: ${dismissalReasonLabel}. ${trimmedClosureNotes}`
        : `${item.case_number} was closed as ${labelize(status)}. ${trimmedClosureNotes}`,
      metadata: {
        finalStatus: status,
        dismissalReason: normalizedDismissalReason || null,
        checklist,
        bypassedRequirements: isAdministrativeDismissal ? missing : []
      }
    });

    await logAudit({
      userId: req.user.id,
      action: "CLOSE_CASE",
      targetTable: "cases",
      targetId: Number(id),
      details: isAdministrativeDismissal
        ? `Dismissed ${item.case_number}: ${dismissalReasonLabel}`
        : `Closed ${item.case_number} as ${status}`,
      ipAddress: req.ip
    });

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Closed",
      message: isAdministrativeDismissal
        ? `${item.case_number} was dismissed. Reason: ${dismissalReasonLabel}.`
        : `${item.case_number} was closed as ${labelize(status)}.`,
      excludeUserId: req.user.id
    });

    return res.json({
      success: true,
      message: status === "dismissed" ? "Case dismissed successfully." : "Case closed successfully."
    });
  } catch (error) {
    console.error("Close case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while closing case."
    });
  }
}

async function requestMoreCaseInfo(req, res) {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || String(message).trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Request details are required."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT id, case_number, status, reported_by_user_id
      FROM cases
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!caseRows.length) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    if (isCaseClosed(caseRows[0].status)) {
      return res.status(400).json({ success: false, message: "Closed cases are read-only." });
    }

    const mutationAccess = await requireCaseMutationAccess(id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    await pool.query(
      `
      UPDATE cases
      SET review_status = 'needs_more_evidence', next_action_notes = ?
      WHERE id = ?
      `,
      [message, id]
    );

    await pool.query(
      `
      INSERT INTO case_updates (case_id, updated_by_user_id, update_type, content)
      VALUES (?, ?, 'note', ?)
      `,
      [id, req.user.id, `More information requested: ${message}`]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "information_requested",
      title: "More information requested",
      details: message
    });

    const workflow = await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "More Information Requested",
      message: `${caseRows[0].case_number} needs more information before the case can proceed: ${message}`,
      excludeUserId: req.user.id
    });

    await logAudit({
      userId: req.user.id,
      action: "REQUEST_CASE_INFO",
      targetTable: "cases",
      targetId: Number(id),
      details: `Requested more information for ${caseRows[0].case_number}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Information request sent.",
      workflow
    });
  } catch (error) {
    console.error("Request case info error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while requesting more information."
    });
  }
}

async function resolveDuplicateCase(req, res) {
  try {
    const { id } = req.params;
    const { duplicateOfCaseId, action = "dismiss_duplicate", notes = "" } = req.body;

    if (!duplicateOfCaseId) {
      return res.status(400).json({
        success: false,
        message: "Duplicate reference case is required."
      });
    }

    const [caseRows] = await pool.query(
      `SELECT id, case_number, status FROM cases WHERE id = ? LIMIT 1`,
      [id]
    );

    const [duplicateRows] = await pool.query(
      `SELECT id, case_number FROM cases WHERE id = ? AND id <> ? LIMIT 1`,
      [duplicateOfCaseId, id]
    );

    if (!caseRows.length || !duplicateRows.length) {
      return res.status(404).json({
        success: false,
        message: "Case or duplicate reference was not found."
      });
    }

    if (isCaseClosed(caseRows[0].status)) {
      return res.status(400).json({ success: false, message: "Closed cases are read-only." });
    }

    const mutationAccess = await requireCaseMutationAccess(id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    const dismissDuplicate = action === "dismiss_duplicate";

    await pool.query(
      `
      UPDATE cases
      SET review_status = 'duplicate',
          duplicate_of_case_id = ?,
          status = CASE WHEN ? THEN 'dismissed' ELSE status END,
          workflow_status = CASE WHEN ? THEN 'closed' ELSE workflow_status END,
          next_action = CASE WHEN ? THEN 'closed' ELSE next_action END,
          next_action_notes = ?
      WHERE id = ?
      `,
      [
        duplicateOfCaseId,
        dismissDuplicate,
        dismissDuplicate,
        dismissDuplicate,
        dismissDuplicate
          ? `Duplicate of ${duplicateRows[0].case_number}. ${notes || ""}`.trim()
          : `Marked duplicate of ${duplicateRows[0].case_number}. ${notes || ""}`.trim(),
        id
      ]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "duplicate_resolution",
      title: dismissDuplicate ? "Duplicate dismissed" : "Duplicate linked",
      details: `${caseRows[0].case_number} was linked to ${duplicateRows[0].case_number}.${notes ? ` ${notes}` : ""}`,
      metadata: { duplicateOfCaseId: Number(duplicateOfCaseId), action }
    });

    const workflow = dismissDuplicate ? { workflow_status: "closed", next_action: "closed", next_action_label: "Closed" } : await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "Duplicate Case Resolved",
      message: `${caseRows[0].case_number} was resolved as a duplicate of ${duplicateRows[0].case_number}.`,
      excludeUserId: req.user.id
    });

    await logAudit({
      userId: req.user.id,
      action: "RESOLVE_DUPLICATE_CASE",
      targetTable: "cases",
      targetId: Number(id),
      details: `Resolved duplicate ${caseRows[0].case_number}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: dismissDuplicate ? "Duplicate case dismissed." : "Duplicate case linked.",
      workflow
    });
  } catch (error) {
    console.error("Resolve duplicate case error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while resolving duplicate case."
    });
  }
}

async function handoffCaseToCounselor(req, res) {
  try {
    const { id } = req.params;
    const { counselorUserId, note, followUpDate } = req.body;

    if (!counselorUserId) {
      return res.status(400).json({
        success: false,
        message: "Counselor is required."
      });
    }

    const [caseRows] = await pool.query(
      `
      SELECT id, case_number, status, student_id
      FROM cases
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    const [counselorRows] = await pool.query(
      `
      SELECT id, first_name, last_name
      FROM users
      WHERE id = ? AND role = 'guidance_counselor' AND status = 'active'
      LIMIT 1
      `,
      [counselorUserId]
    );

    if (!caseRows.length || !counselorRows.length) {
      return res.status(404).json({
        success: false,
        message: "Case or counselor was not found."
      });
    }

    if (isCaseClosed(caseRows[0].status)) {
      return res.status(400).json({ success: false, message: "Closed cases are read-only." });
    }

    const mutationAccess = await requireCaseMutationAccess(id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    const finalNote = note || "Counseling follow-up requested from discipline workflow.";

    const [result] = await pool.query(
      `
      INSERT INTO counselor_interventions
      (case_id, student_id, counselor_user_id, note_type, note, status, follow_up_date)
      VALUES (?, ?, ?, 'follow_up', ?, 'planned', ?)
      `,
      [id, caseRows[0].student_id, counselorUserId, finalNote, followUpDate || null]
    );

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "counseling_handoff",
      title: "Counseling handoff created",
      details: `Assigned to ${counselorRows[0].first_name} ${counselorRows[0].last_name}.${followUpDate ? ` Follow-up date: ${followUpDate}.` : ""}`,
      metadata: { interventionId: result.insertId, counselorUserId: Number(counselorUserId) }
    });

    await createNotification(
      counselorUserId,
      "Counseling Follow-up Assigned",
      `${caseRows[0].case_number} needs counseling follow-up: ${finalNote}`,
      "case"
    );

    const workflow = await refreshCaseWorkflow(id);

    await notifyCaseStakeholders({
      caseId: id,
      title: "Counseling Follow-up Added",
      message: `${caseRows[0].case_number} was referred for counseling follow-up.${followUpDate ? ` Follow-up date: ${followUpDate}.` : ""}`,
      excludeUserId: req.user.id
    });

    await logAudit({
      userId: req.user.id,
      action: "HANDOFF_CASE_TO_COUNSELOR",
      targetTable: "counselor_interventions",
      targetId: result.insertId,
      details: `Counselor handoff for ${caseRows[0].case_number}`,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: "Counseling handoff created.",
      workflow
    });
  } catch (error) {
    console.error("Counselor handoff error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating counselor handoff."
    });
  }
}

async function acknowledgeCaseNotice(req, res) {
  try {
    const { id } = req.params;
    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(id, context);

    if (!caseItem) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    await acknowledgeCase({ caseId: id, user: req.user });

    return res.json({
      success: true,
      message: "Case notice acknowledged."
    });
  } catch (error) {
    console.error("Acknowledge case notice error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while acknowledging case."
    });
  }
}

async function getCaseRepeatWarning(req, res) {
  try {
    const { id } = req.params;
    const context = await getActorContext(req.user);
    const caseItem = await getCaseForAccess(id, context);

    if (!caseItem) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    const [rows] = await pool.query(
      `SELECT student_id, violation_type FROM cases WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Case not found." });
    }

    const repeatWarning = await getRepeatViolationSummary({
      studentId: rows[0].student_id,
      violation: rows[0].violation_type,
      excludeCaseId: id
    });

    return res.json({
      success: true,
      repeat_warning: repeatWarning
    });
  } catch (error) {
    console.error("Get repeat warning error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while checking repeat violations."
    });
  }
}

async function checkRepeatViolation(req, res) {
  try {
    const { studentId, studentNumber, violation } = req.query;

    if ((!studentId && !studentNumber) || !violation) {
      return res.status(400).json({
        success: false,
        message: "Student and violation are required."
      });
    }

    const params = [];
    let whereClause = "";

    if (studentId) {
      whereClause = "id = ?";
      params.push(studentId);
    } else {
      whereClause = "student_number = ?";
      params.push(studentNumber);
    }

    const [studentRows] = await pool.query(
      `SELECT id FROM students WHERE ${whereClause} LIMIT 1`,
      params
    );

    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    const repeatWarning = await getRepeatViolationSummary({
      studentId: studentRows[0].id,
      violation
    });

    return res.json({
      success: true,
      repeat_warning: repeatWarning
    });
  } catch (error) {
    console.error("Check repeat violation error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while checking repeat violations."
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

    await createWorkflowEvent({
      caseId: id,
      userId: req.user.id,
      eventType: "claim",
      title: "Case claimed",
      details: `Case claimed by ${actor.first_name} ${actor.last_name} for investigation.`
    });

    const workflow = await refreshCaseWorkflow(id);

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

    await notifyCaseStakeholders({
      caseId: id,
      title: "Case Investigation Started",
      message: `${caseItem.case_number} was claimed and is now under investigation.`,
      includeStudentParents: true,
      includeStaff: false,
      excludeUserId: req.user.id
    });

    return res.json({
      success: true,
      message: "Case claimed successfully.",
      case: {
        id: caseItem.id,
        case_number: caseItem.case_number,
        status: "under_investigation",
        assigned_to_user_id: req.user.id
      },
      workflow
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
      SELECT status, COUNT(*) AS total
      FROM (
        SELECT
          CASE
            WHEN c.status NOT IN ('resolved', 'dismissed')
              AND EXISTS (
                SELECT 1
                FROM hearings overdue_hearing
                WHERE overdue_hearing.case_id = c.id
                  AND overdue_hearing.status = 'scheduled'
                  AND TIMESTAMP(
                    overdue_hearing.scheduled_date,
                    COALESCE(overdue_hearing.scheduled_time, '23:59:59')
                  ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
              )
            THEN 'hearing_overdue'
            ELSE c.status
          END AS status
        FROM cases c
        WHERE 1 = 1
        ${access.clause}
      ) status_summary
      GROUP BY status_summary.status
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

async function getCaseActionSummary(req, res) {
  try {
    const context = await getActorContext(req.user);
    const access = buildCaseAccessClause(context);

    const [rows] = await pool.query(
      `
      SELECT
        next_action,
        workflow_status,
        COUNT(*) AS total
      FROM (
        SELECT
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM hearings overdue_hearing
              WHERE overdue_hearing.case_id = c.id
                AND overdue_hearing.status = 'scheduled'
                AND TIMESTAMP(
                  overdue_hearing.scheduled_date,
                  COALESCE(overdue_hearing.scheduled_time, '23:59:59')
                ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
            )
            THEN 'update_hearing_result'
            ELSE c.next_action
          END AS next_action,
          c.workflow_status
        FROM cases c
        JOIN students s ON c.student_id = s.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE c.status NOT IN ('resolved', 'dismissed')
        ${access.clause}
      ) action_summary
      GROUP BY action_summary.next_action, action_summary.workflow_status
      ORDER BY total DESC
      `,
      access.params
    );

    const [priorityRows] = await pool.query(
      `
      SELECT
        c.id,
        c.case_number,
        c.violation_type,
        c.severity_level,
        c.status,
        c.workflow_status,
        c.next_action,
        c.next_action_notes,
        c.incident_date,
        s.student_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        EXISTS (
          SELECT 1
          FROM hearings overdue_hearing
          WHERE overdue_hearing.case_id = c.id
            AND overdue_hearing.status = 'scheduled'
            AND TIMESTAMP(
              overdue_hearing.scheduled_date,
              COALESCE(overdue_hearing.scheduled_time, '23:59:59')
            ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE c.status NOT IN ('resolved', 'dismissed')
      ${access.clause}
      ORDER BY
        FIELD(c.next_action, 'review_report', 'needs_assignment', 'needs_more_evidence', 'needs_evidence_review', 'awaiting_hearing_result', 'issue_sanction', 'counseling_follow_up', 'awaiting_appeal_review', 'closure_checklist', 'schedule_hearing'),
        c.created_at DESC
      LIMIT 8
      `,
      access.params
    );

    return res.json({
      success: true,
      counts: rows.map(item => ({
        ...item,
        next_action_label: labelize(item.next_action),
        workflow_status_label: labelize(item.workflow_status)
      })),
      priority_cases: priorityRows.map(item => {
        const hasOverdueHearing = Number(item.has_overdue_hearing) === 1;
        return {
          ...item,
          has_overdue_hearing: hasOverdueHearing,
          operational_status: hasOverdueHearing ? "hearing_overdue" : item.status,
          operational_status_label: hasOverdueHearing ? "Hearing Overdue" : labelize(item.status),
          operational_next_action: hasOverdueHearing ? "update_hearing_result" : item.next_action,
          next_action_label: hasOverdueHearing ? "Update Hearing Result" : labelize(item.next_action),
          workflow_status_label: labelize(item.workflow_status)
        };
      })
    });
  } catch (error) {
    console.error("Get case action summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching case action summary."
    });
  }
}

async function getCaseProcessAuditReport(req, res) {
  try {
    const context = await getActorContext(req.user);
    const access = buildCaseAccessClause(context);
    const params = [];
    const filterClause = buildCaseFilterClause(req.query, params, req.user);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const [rows] = await pool.query(
      `
      SELECT c.id
      FROM cases c
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1 = 1
      ${access.clause}
      ${filterClause}
      ORDER BY c.created_at DESC
      LIMIT ?
      `,
      [...access.params, ...params, limit]
    );

    const audits = [];
    for (const row of rows) {
      const audit = await getCaseProcessAudit(row.id);
      if (audit) {
        audits.push(audit);
      }
    }

    return res.json({
      success: true,
      summary: {
        total: audits.length,
        complete: audits.filter(item => item.status === "complete").length,
        warning: audits.filter(item => item.status === "warning").length,
        blocked: audits.filter(item => item.status === "blocked").length,
        average_score: audits.length
          ? Math.round(audits.reduce((sum, item) => sum + item.score, 0) / audits.length)
          : 100
      },
      audits
    });
  } catch (error) {
    console.error("Get case process audit error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while running process audit."
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
        c.review_status,
        c.workflow_status,
        c.next_action,
        c.next_action_notes,
        c.incident_date,
        c.incident_time,
        c.location,
        c.description,
        EXISTS (
          SELECT 1
          FROM hearings overdue_hearing
          WHERE overdue_hearing.case_id = c.id
            AND overdue_hearing.status = 'scheduled'
            AND TIMESTAMP(
              overdue_hearing.scheduled_date,
              COALESCE(overdue_hearing.scheduled_time, '23:59:59')
            ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing
      FROM cases c
      WHERE c.student_id = ?
      ORDER BY c.created_at DESC
      `,
      [student.id]
    );

    return res.json({
      success: true,
      student_number: student.student_number,
      cases: rows.map(addOperationalCaseStatus)
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
        c.review_status,
        c.workflow_status,
        c.next_action,
        c.next_action_notes,
        c.incident_date,
        c.incident_time,
        c.location,
        c.description,
        s.student_number,
        COALESCE(u.first_name, s.first_name) AS first_name,
        COALESCE(u.last_name, s.last_name) AS last_name,
        EXISTS (
          SELECT 1
          FROM hearings overdue_hearing
          WHERE overdue_hearing.case_id = c.id
            AND overdue_hearing.status = 'scheduled'
            AND TIMESTAMP(
              overdue_hearing.scheduled_date,
              COALESCE(overdue_hearing.scheduled_time, '23:59:59')
            ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing
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
      cases: rows.map(item => addOperationalCaseStatus({
        ...item,
        review_status_label: labelize(item.review_status),
        workflow_status_label: labelize(item.workflow_status),
        next_action_label: labelize(item.next_action)
      }))
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
  acknowledgeCaseNotice,
  checkRepeatViolation,
  getCaseUpdates,
  getCaseRepeatWarning,
  updateCaseStatus,
  reviewCaseReport,
  closeCaseWithChecklist,
  getCaseActionSummary,
  getCaseProcessAuditReport,
  handoffCaseToCounselor,
  requestMoreCaseInfo,
  resolveDuplicateCase,
  assignCase,
  claimCase,
  getCaseSummary,
  getMyStudentCases,
  getParentChildCases,
  getActorContext,
  getCaseForAccess,
  getCaseStatusRecord,
  requireCaseMutationAccess,
  isCaseClosed
};
