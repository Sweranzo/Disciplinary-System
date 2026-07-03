const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");
const { sendSms, renderSmsTemplate } = require("../utils/smsService");
const { sendStudentEmail, sendParentEmail } = require("../utils/emailService");
const {
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

function formatHearingSchedule(date, time, location) {
  return `${date || "date not set"} at ${String(time || "time not set").slice(0, 5)}${location ? ` in ${location}` : ""}`;
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

async function notifyHearingStakeholders({
  caseId,
  parentTitle,
  parentMessage,
  studentTitle,
  studentMessage,
  smsTemplateKey = null,
  smsTemplateData = {},
  studentEmailSubject = null,
  studentEmailMessage = null,
  parentEmailSubject = null,
  parentEmailMessage = null,
  actorUserId = null,
  ipAddress = null
}) {
  const notifiedStudentUsers = new Set();
  const notifiedParentUsers = new Set();
  const emailedStudents = new Set();
  const emailedParents = new Set();
  const [recipientRows] = await pool.query(
    `
    SELECT
      s.id AS student_id,
      su.id AS student_user_id,
      s.email AS student_email,
      su.email AS account_email,
      COALESCE(su.first_name, s.first_name) AS student_first_name,
      COALESCE(su.last_name, s.last_name) AS student_last_name,
      p.id AS parent_id,
      p.phone_number,
      p.email AS parent_email,
      pu.id AS parent_user_id,
      pu.email AS account_email,
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
      await createNotification(row.student_user_id, studentTitle, studentMessage, "hearing");
      notifiedStudentUsers.add(row.student_user_id);
    }

    if (studentEmailSubject && studentEmailMessage && row.student_id && !emailedStudents.has(row.student_id)) {
      await sendStudentEmail({
        caseId,
        student: {
          student_id: row.student_id,
          student_user_id: row.student_user_id,
          student_email: row.student_email,
          account_email: row.account_email,
          first_name: row.student_first_name,
          last_name: row.student_last_name
        },
        subject: studentEmailSubject,
        message: studentEmailMessage
      });
      emailedStudents.add(row.student_id);
    }

    if (row.parent_user_id && !notifiedParentUsers.has(row.parent_user_id) && parentTitle && parentMessage) {
      await createNotification(row.parent_user_id, parentTitle, parentMessage, "hearing");
      notifiedParentUsers.add(row.parent_user_id);
    }

    if (parentEmailSubject && parentEmailMessage && row.parent_id && !emailedParents.has(row.parent_id)) {
      await sendParentEmail({
        caseId,
        parent: {
          parent_id: row.parent_id,
          parent_user_id: row.parent_user_id,
          parent_email: row.parent_email,
          account_email: row.account_email,
          first_name: row.parent_first_name,
          last_name: row.parent_last_name
        },
        subject: parentEmailSubject,
        message: parentEmailMessage
      });
      emailedParents.add(row.parent_id);
    }

    if (row.parent_id && row.phone_number && smsTemplateKey) {
      const parentName = `${row.parent_first_name || "Parent"} ${row.parent_last_name || ""}`.trim();
      await sendSms({
        caseId,
        parentId: row.parent_id,
        phoneNumber: row.phone_number,
        message: renderSmsTemplate(smsTemplateKey, {
          ...smsTemplateData,
          parentName
        }),
        userId: actorUserId,
        ipAddress
      });
    }
  }
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

    if (isCaseClosed(caseItem.status)) {
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

    await createWorkflowEvent({
      caseId,
      userId: req.user.id,
      eventType: "hearing_scheduled",
      title: "Hearing scheduled",
      details: `Hearing scheduled for ${caseItem.case_number} on ${scheduledDate} at ${scheduledTime}.`,
      metadata: { scheduledDate, scheduledTime, location: location || null }
    });

    const workflow = await refreshCaseWorkflow(caseId);

    await notifyHearingStakeholders({
      caseId,
      studentTitle: "Hearing Scheduled",
      studentMessage: `A hearing has been scheduled for case ${caseItem.case_number} on ${scheduledDate} at ${scheduledTime}.`,
      parentTitle: "Hearing Scheduled for Your Child",
      parentMessage: `A hearing has been scheduled for case ${caseItem.case_number} on ${scheduledDate} at ${scheduledTime}.`,
      smsTemplateKey: "hearingScheduled",
      smsTemplateData: {
        caseNumber: caseItem.case_number,
        scheduledDate,
        scheduledTime,
        location: location || "",
        locationSentence: location ? ` Location: ${location}.` : ""
      },
      studentEmailSubject: `Hearing Scheduled: ${caseItem.case_number}`,
      studentEmailMessage:
        `A hearing has been scheduled for case ${caseItem.case_number}.\n\n`
        + `Schedule: ${formatHearingSchedule(scheduledDate, scheduledTime, location)}\n\n`
        + "Please attend at the scheduled time and log in to the student portal for case details.\n\n"
        + "Philtech-GMA Disciplinary Office",
      parentEmailSubject: `Hearing Scheduled for Your Child: ${caseItem.case_number}`,
      parentEmailMessage:
        `A hearing has been scheduled for case ${caseItem.case_number}.\n\n`
        + `Schedule: ${formatHearingSchedule(scheduledDate, scheduledTime, location)}\n\n`
        + "Please log in to the parent portal or contact the school office for details.\n\n"
        + "Philtech-GMA Disciplinary Office",
      actorUserId: req.user.id,
      ipAddress: req.ip
    });

    await notifyCaseStakeholders({
      caseId,
      title: "Hearing Scheduled",
      message: `A hearing for ${caseItem.case_number} is scheduled for ${formatHearingSchedule(scheduledDate, scheduledTime, location)}.`,
      type: "hearing",
      includeStudentParents: false,
      includeStaff: true,
      excludeUserId: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Hearing scheduled successfully.",
      workflow
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
          AND TIMESTAMP(
            h.scheduled_date,
            COALESCE(h.scheduled_time, '23:59:59')
          ) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing,
        h.created_at,
        c.case_number,
        c.violation_type,
        c.status AS case_status,
        c.assigned_to_user_id,
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
      hearings: rows.map(item => {
        const hasOverdueHearing = Number(item.has_overdue_hearing) === 1;
        return {
          ...item,
          has_overdue_hearing: hasOverdueHearing,
          operational_status: hasOverdueHearing ? "hearing_overdue" : item.status,
          created_by_role_label: formatRoleLabel(item.created_by_role)
        };
      })
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
    const { scheduledDate, scheduledTime, location, status, outcome, finding, recommendation } = req.body;

    const [rows] = await pool.query(
      `
      SELECT
        h.id,
        h.case_id,
        h.status,
        DATE_FORMAT(h.scheduled_date, '%Y-%m-%d') AS scheduled_date,
        h.scheduled_time,
        h.location,
        h.outcome,
        h.finding,
        h.recommendation,
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

    const mutationAccess = await requireCaseMutationAccess(hearing.case_id, req.user);
    if (!mutationAccess.allowed) {
      return res.status(mutationAccess.status).json({
        success: false,
        message: mutationAccess.message
      });
    }

    const allowedStatuses = ["scheduled", "completed", "cancelled", "missed"];
    const allowedFindings = ["pending", "admitted", "denied", "resolved", "dismissed", "sanction_recommended", "counseling_recommended"];
    const nextStatus = status && allowedStatuses.includes(status) ? status : hearing.status;
    const nextFinding = finding && allowedFindings.includes(finding) ? finding : "pending";
    const nextDate = scheduledDate || hearing.scheduled_date;
    const nextTime = scheduledTime || hearing.scheduled_time;
    const nextLocation = location || hearing.location;
    const scheduleChanged = nextStatus === "scheduled" && (
      String(nextDate || "") !== String(hearing.scheduled_date || "")
      || String(nextTime || "").slice(0, 5) !== String(hearing.scheduled_time || "").slice(0, 5)
      || String(nextLocation || "") !== String(hearing.location || "")
    );

    if (nextStatus === "missed" && !String(outcome || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Missed hearing notes are required before notifying the student."
      });
    }

    await pool.query(
      `
      UPDATE hearings
      SET
        scheduled_date = COALESCE(?, scheduled_date),
        scheduled_time = COALESCE(?, scheduled_time),
        location = COALESCE(?, location),
        status = ?,
        outcome = ?,
        finding = ?,
        recommendation = ?,
        result_recorded_by_user_id = CASE WHEN ? IN ('completed', 'missed') THEN ? ELSE result_recorded_by_user_id END,
        result_recorded_at = CASE WHEN ? IN ('completed', 'missed') THEN CURRENT_TIMESTAMP ELSE result_recorded_at END
      WHERE id = ?
      `,
      [
        scheduledDate || null,
        scheduledTime || null,
        location || null,
        nextStatus,
        outcome || null,
        nextFinding,
        recommendation || null,
        nextStatus,
        req.user.id,
        nextStatus,
        id
      ]
    );

    if (nextStatus === "completed") {
      const finalCaseStatus = nextFinding === "dismissed"
        ? "dismissed"
        : nextFinding === "resolved"
          ? "resolved"
          : "under_investigation";

      await pool.query(
        `
        UPDATE cases
        SET status = ?
        WHERE id = ?
        `,
        [finalCaseStatus, hearing.case_id]
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

    if (nextStatus === "missed") {
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

    await createWorkflowEvent({
      caseId: hearing.case_id,
      userId: req.user.id,
      eventType: nextStatus === "completed"
        ? "hearing_result"
        : nextStatus === "missed"
          ? "hearing_missed"
        : scheduleChanged
          ? "hearing_rescheduled"
          : "hearing_updated",
      title: nextStatus === "completed"
        ? "Hearing result recorded"
        : nextStatus === "missed"
          ? "Hearing marked missed"
        : scheduleChanged
          ? "Hearing rescheduled"
          : "Hearing updated",
      details: nextStatus === "completed"
        ? `Hearing for ${hearing.case_number} was completed. Finding: ${labelize(nextFinding)}.${outcome ? ` Outcome: ${outcome}` : ""}${recommendation ? ` Recommendation: ${recommendation}` : ""}`
        : nextStatus === "missed"
          ? `Hearing for ${hearing.case_number} scheduled for ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} was marked missed.${outcome ? ` Notes: ${outcome}` : ""}`
        : scheduleChanged
          ? `Hearing for ${hearing.case_number} moved from ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} to ${formatHearingSchedule(nextDate, nextTime, nextLocation)}.`
          : `Hearing for ${hearing.case_number} is ${labelize(nextStatus)}.`,
      metadata: {
        status: nextStatus,
        finding: nextFinding,
        previousSchedule: {
          date: hearing.scheduled_date,
          time: hearing.scheduled_time,
          location: hearing.location
        },
        schedule: {
          date: nextDate,
          time: nextTime,
          location: nextLocation
        }
      }
    });

    if (nextStatus === "completed" && nextFinding === "counseling_recommended") {
      const [counselorRows] = await pool.query(
        `
        SELECT id
        FROM users
        WHERE role = 'guidance_counselor' AND status = 'active'
        `
      );

      for (const counselor of counselorRows) {
        await createNotification(
          counselor.id,
          "Counseling Recommendation",
          `${hearing.case_number} has a hearing result recommending counseling follow-up.`,
          "case"
        );
      }
    }

    const workflow = await refreshCaseWorkflow(hearing.case_id);

    const notificationTitle = nextStatus === "completed"
      ? "Hearing Result Recorded"
      : scheduleChanged
        ? "Hearing Rescheduled"
        : nextStatus === "missed"
          ? "Hearing Missed"
        : nextStatus === "cancelled"
          ? "Hearing Cancelled"
          : "Hearing Updated";
    const notificationMessage = nextStatus === "completed"
      ? `The hearing for case ${hearing.case_number} was completed. Finding: ${labelize(nextFinding)}.${outcome ? ` Outcome: ${outcome}` : ""}`
      : scheduleChanged
        ? `The hearing for case ${hearing.case_number} was rescheduled from ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} to ${formatHearingSchedule(nextDate, nextTime, nextLocation)}.`
        : nextStatus === "missed"
          ? `The hearing for case ${hearing.case_number} scheduled for ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} was marked missed.${outcome ? ` Notes: ${outcome}` : ""}`
        : `The hearing for case ${hearing.case_number} is now ${labelize(nextStatus)}.`;

    const shouldEmailStudentSchedule = scheduleChanged && nextStatus === "scheduled";
    const shouldEmailStudentMissed = nextStatus === "missed";

    await notifyHearingStakeholders({
      caseId: hearing.case_id,
      studentTitle: notificationTitle,
      studentMessage: notificationMessage,
      parentTitle: `${notificationTitle} for Your Child`,
      parentMessage: notificationMessage,
      smsTemplateKey: "hearingUpdated",
      smsTemplateData: {
        caseNumber: hearing.case_number,
        notificationTitle,
        notificationMessage,
        status: labelize(nextStatus),
        scheduledDate: nextDate || "",
        scheduledTime: nextTime || "",
        location: nextLocation || "",
        locationSentence: nextLocation ? ` Location: ${nextLocation}.` : ""
      },
      studentEmailSubject: shouldEmailStudentSchedule
        ? `Hearing Rescheduled: ${hearing.case_number}`
        : shouldEmailStudentMissed
          ? `Missed Hearing Notice: ${hearing.case_number}`
          : null,
      studentEmailMessage: shouldEmailStudentSchedule
        ? `The hearing for case ${hearing.case_number} has been rescheduled.\n\nNew schedule: ${formatHearingSchedule(nextDate, nextTime, nextLocation)}\n\nPlease attend at the scheduled time and log in to the student portal for case details.\n\nPhiltech-GMA Disciplinary Office`
        : shouldEmailStudentMissed
          ? `The hearing for case ${hearing.case_number} scheduled for ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} was marked missed.${outcome ? `\n\nNotes: ${outcome}` : ""}\n\nPlease contact the school office or check the student portal for the next required action.\n\nPhiltech-GMA Disciplinary Office`
          : null,
      parentEmailSubject: shouldEmailStudentSchedule
        ? `Hearing Rescheduled for Your Child: ${hearing.case_number}`
        : shouldEmailStudentMissed
          ? `Missed Hearing Notice for Your Child: ${hearing.case_number}`
          : null,
      parentEmailMessage: shouldEmailStudentSchedule
        ? `The hearing for case ${hearing.case_number} has been rescheduled.\n\nNew schedule: ${formatHearingSchedule(nextDate, nextTime, nextLocation)}\n\nPlease log in to the parent portal or contact the school office for details.\n\nPhiltech-GMA Disciplinary Office`
        : shouldEmailStudentMissed
          ? `The hearing for case ${hearing.case_number} scheduled for ${formatHearingSchedule(hearing.scheduled_date, hearing.scheduled_time, hearing.location)} was marked missed.${outcome ? `\n\nNotes: ${outcome}` : ""}\n\nPlease contact the school office or check the parent portal for the next required action.\n\nPhiltech-GMA Disciplinary Office`
          : null,
      actorUserId: req.user.id,
      ipAddress: req.ip
    });

    await notifyCaseStakeholders({
      caseId: hearing.case_id,
      title: notificationTitle,
      message: notificationMessage,
      type: "hearing",
      includeStudentParents: false,
      includeStaff: true,
      excludeUserId: req.user.id
    });

    return res.json({
      success: true,
      message: "Hearing updated successfully.",
      workflow
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
