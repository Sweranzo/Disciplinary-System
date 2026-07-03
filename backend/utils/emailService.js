const pool = require("../config/db");

let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

function isEmailEnabled() {
  return String(process.env.EMAIL_ENABLED || "").toLowerCase() === "true";
}

function sanitizeEmail(emailAddress = "") {
  return String(emailAddress || "").trim();
}

function getFromAddress() {
  const fromEmail = sanitizeEmail(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "");
  const fromName = String(process.env.SMTP_FROM_NAME || "Philtech-GMA").trim();

  return fromName && fromEmail ? `"${fromName.replace(/"/g, "'")}" <${fromEmail}>` : fromEmail;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPortalUrl() {
  return String(process.env.FRONTEND_URL || process.env.PORTAL_URL || "http://127.0.0.1:5500/frontend/pages/auth/login.html").trim();
}

function getSmtpTransporter() {
  if (!nodemailer) {
    throw new Error("Nodemailer is not installed. Run npm install in the backend folder.");
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass || !getFromAddress()) {
    throw new Error("SMTP credentials are incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

async function logEmail({
  caseId = null,
  studentId = null,
  parentId = null,
  userId = null,
  recipientRole = "student",
  emailAddress,
  subject,
  message,
  deliveryStatus = "pending",
  failureReason = null,
  sentAt = null
}) {
  await pool.query(
    `
    INSERT INTO email_logs
    (case_id, student_id, parent_id, user_id, recipient_role, email_address, subject, message, delivery_status, failure_reason, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      caseId,
      studentId,
      parentId,
      userId,
      recipientRole,
      emailAddress,
      subject,
      message,
      deliveryStatus,
      failureReason,
      sentAt
    ]
  );
}

async function safeLogEmail(logEntry) {
  try {
    await logEmail(logEntry);
  } catch (error) {
    console.error("Email log error:", error);
  }
}

async function sendEmail({
  caseId = null,
  studentId = null,
  parentId = null,
  userId = null,
  recipientRole = "student",
  emailAddress,
  subject,
  message,
  html = null
}) {
  const recipient = sanitizeEmail(emailAddress);

  if (!recipient) {
    await safeLogEmail({
      caseId,
      studentId,
      parentId,
      userId,
      recipientRole,
      emailAddress: "",
      subject,
      message,
      deliveryStatus: "failed",
      failureReason: "Student email address is missing."
    });

    return {
      success: false,
      status: "failed",
      reason: "Student email address is missing."
    };
  }

  if (!isEmailEnabled()) {
    await safeLogEmail({
      caseId,
      studentId,
      parentId,
      userId,
      recipientRole,
      emailAddress: recipient,
      subject,
      message,
      deliveryStatus: "failed",
      failureReason: "Email sending is disabled."
    });

    return {
      success: false,
      status: "disabled",
      reason: "Email sending is disabled."
    };
  }

  try {
    const transporter = getSmtpTransporter();
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: recipient,
      subject,
      text: message,
      html: html || undefined
    });

    await safeLogEmail({
      caseId,
      studentId,
      parentId,
      userId,
      recipientRole,
      emailAddress: recipient,
      subject,
      message,
      deliveryStatus: "sent",
      sentAt: new Date()
    });

    return {
      success: true,
      status: "sent",
      providerResponse: info
    };
  } catch (error) {
    await safeLogEmail({
      caseId,
      studentId,
      parentId,
      userId,
      recipientRole,
      emailAddress: recipient,
      subject,
      message,
      deliveryStatus: "failed",
      failureReason: error.message || "Email provider request failed."
    });

    return {
      success: false,
      status: "failed",
      reason: error.message || "Email provider request failed."
    };
  }
}

async function sendStudentEmail({ caseId = null, student, subject, message, html = null }) {
  return sendEmail({
    caseId,
    studentId: student?.student_id || student?.id || null,
    userId: student?.student_user_id || student?.user_id || null,
    recipientRole: "student",
    emailAddress: student?.account_email || student?.student_email || student?.email || "",
    subject,
    message,
    html
  });
}

async function sendParentEmail({ caseId = null, parent, subject, message, html = null }) {
  return sendEmail({
    caseId,
    parentId: parent?.parent_id || parent?.id || null,
    userId: parent?.parent_user_id || parent?.user_id || null,
    recipientRole: "parent",
    emailAddress: parent?.account_email || parent?.parent_email || parent?.email || "",
    subject,
    message,
    html
  });
}

async function sendAccountCredentialsEmail({
  credential,
  studentId = null,
  parentId = null,
  userId = null
}) {
  const role = credential?.role || "student";
  const ownerName = credential?.name || (role === "parent" ? "Parent/Guardian" : "Student");
  const loginUrl = getPortalUrl();
  const subject = "Your Philtech-GMA Portal Account";
  const message =
    `Dear ${ownerName},\n\n`
    + "Your Philtech-GMA Disciplinary System portal account has been created.\n\n"
    + `Role: ${role}\n`
    + `Username: ${credential?.username || ""}\n`
    + `Temporary Password: ${credential?.password || ""}\n`
    + `Login Link: ${loginUrl}\n\n`
    + "Please log in and change your password after your first successful login. Keep these credentials private.\n\n"
    + "Philtech-GMA Disciplinary Office";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;color:#8A1538;">Philtech-GMA Portal Account Created</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Your Philtech-GMA Disciplinary System portal account has been created.</p>
      <table style="border-collapse:collapse;margin:16px 0;width:100%;max-width:520px;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Role</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(role)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Username</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(credential?.username || "")}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;"><strong>Temporary Password</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(credential?.password || "")}</td></tr>
      </table>
      <p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#8A1538;color:#ffffff;text-decoration:none;font-weight:bold;">Open Portal</a></p>
      <p>Please log in and change your password after your first successful login. Keep these credentials private.</p>
      <p>Philtech-GMA Disciplinary Office</p>
    </div>
  `;

  return sendEmail({
    studentId,
    parentId,
    userId,
    recipientRole: role,
    emailAddress: credential?.email || "",
    subject,
    message,
    html
  });
}

module.exports = {
  isEmailEnabled,
  sendEmail,
  sendStudentEmail,
  sendParentEmail,
  sendAccountCredentialsEmail
};
