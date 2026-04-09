const pool = require("../config/db");
const { getActorContext } = require("./caseController");

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
      hearings: rows
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
        c.case_number,
        c.violation_type,
        su.first_name,
        su.last_name,
        s.student_number
      FROM student_parents sp
      JOIN students s ON sp.student_id = s.id
      JOIN users su ON s.user_id = su.id
      JOIN cases c ON c.student_id = s.id
      JOIN hearings h ON h.case_id = c.id
      WHERE sp.parent_id = ?
      ORDER BY h.created_at DESC
      `,
      [parentId]
    );

    return res.json({
      success: true,
      hearings: rows
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
