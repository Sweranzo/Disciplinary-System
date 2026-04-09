const pool = require("../config/db");

async function logAudit({
  userId = null,
  action,
  targetTable = null,
  targetId = null,
  details = null,
  ipAddress = null
}) {
  try {
    await pool.query(
      `
      INSERT INTO audit_logs
      (user_id, action, target_table, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [userId, action, targetTable, targetId, details, ipAddress]
    );
  } catch (error) {
    console.error("Audit log error:", error.message);
  }
}

module.exports = { logAudit };