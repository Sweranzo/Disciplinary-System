const pool = require("../config/db");
const { getActorContext } = require("./caseController");

function addOperationalHearingStatus(item) {
  const hasOverdueHearing = Number(item.has_overdue_hearing) === 1;
  return {
    ...item,
    has_overdue_hearing: hasOverdueHearing,
    operational_status: hasOverdueHearing ? "hearing_overdue" : item.status
  };
}

async function getMyStudentHearings(req, res) {
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
        h.id,
        h.scheduled_date,
        h.scheduled_time,
        h.location,
        h.status,
        (
          h.status = 'scheduled'
          AND TIMESTAMP(h.scheduled_date, COALESCE(h.scheduled_time, '23:59:59'))
            < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing,
        c.case_number,
        c.violation_type
      FROM hearings h
      JOIN cases c ON h.case_id = c.id
      WHERE c.student_id = ?
      ORDER BY h.created_at DESC
      `,
      [studentId]
    );

    return res.json({
      success: true,
      hearings: rows.map(addOperationalHearingStatus)
    });
  } catch (error) {
    console.error("Get student hearings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching hearings."
    });
  }
}

async function getParentChildHearings(req, res) {
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
        h.id,
        h.scheduled_date,
        h.scheduled_time,
        h.location,
        h.status,
        (
          h.status = 'scheduled'
          AND TIMESTAMP(h.scheduled_date, COALESCE(h.scheduled_time, '23:59:59'))
            < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
        ) AS has_overdue_hearing,
        c.case_number,
        c.violation_type,
        COALESCE(su.first_name, s.first_name) AS first_name,
        COALESCE(su.last_name, s.last_name) AS last_name,
        s.student_number
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN users su ON s.user_id = su.id
      JOIN cases c ON c.student_id = s.id
      JOIN hearings h ON h.case_id = c.id
      WHERE sp.parent_id = ?
      ORDER BY h.created_at DESC
      `,
      [parentId]
    );

    return res.json({
      success: true,
      hearings: rows.map(addOperationalHearingStatus)
    });
  } catch (error) {
    console.error("Get parent hearings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching parent hearings."
    });
  }
}

module.exports = {
  getMyStudentHearings,
  getParentChildHearings
};
