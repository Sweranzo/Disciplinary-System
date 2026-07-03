const pool = require("../config/db");
const { logAudit } = require("./auditLogger");

function isSmsEnabled() {
  return String(process.env.SMS_ENABLED || "").toLowerCase() === "true";
}

function getSmsProvider() {
  return String(process.env.SMS_PROVIDER || "semaphore").trim().toLowerCase();
}

const SMS_TEMPLATE_CONFIG = Object.freeze({
  caseReport: {
    envKey: "SMS_TEMPLATE_CASE_REPORT",
    label: "Case Report",
    defaultValue: "Dear {parentName}, Philtech-GMA Disciplinary Alert: A new case ({caseNumber}) was reported for {studentName} regarding {violation} on {incidentDate}.{locationSentence} Please check the system or contact the school office for details."
  },
  hearingScheduled: {
    envKey: "SMS_TEMPLATE_HEARING_SCHEDULED",
    label: "Hearing Scheduled",
    defaultValue: "Dear {parentName}, Philtech-GMA Hearing Notice: A hearing for case {caseNumber} is scheduled on {scheduledDate} at {scheduledTime}.{locationSentence} Please check the portal for details."
  },
  hearingUpdated: {
    envKey: "SMS_TEMPLATE_HEARING_UPDATED",
    label: "Hearing Updated",
    defaultValue: "Dear {parentName}, Philtech-GMA {notificationTitle}: {notificationMessage}"
  },
  sanctionAssigned: {
    envKey: "SMS_TEMPLATE_SANCTION_ASSIGNED",
    label: "Sanction Assigned",
    defaultValue: "Dear {parentName}, Philtech-GMA Sanction Notice: A {sanctionType} sanction was assigned for case {caseNumber}.{startDateSentence}{endDateSentence}"
  },
  sanctionUpdated: {
    envKey: "SMS_TEMPLATE_SANCTION_UPDATED",
    label: "Sanction Updated",
    defaultValue: "Dear {parentName}, Philtech-GMA Sanction Update: Case {caseNumber} sanction is now {status}.{startDateSentence}{endDateSentence}"
  }
});

function getSmsTemplates() {
  return Object.entries(SMS_TEMPLATE_CONFIG).map(([key, config]) => ({
    key,
    envKey: config.envKey,
    label: config.label,
    value: process.env[config.envKey] || config.defaultValue,
    defaultValue: config.defaultValue
  }));
}

function getSmsTemplateValue(key) {
  const config = SMS_TEMPLATE_CONFIG[key];
  if (!config) {
    return "";
  }

  return process.env[config.envKey] || config.defaultValue;
}

function renderSmsTemplate(key, values = {}) {
  return getSmsTemplateValue(key)
    .replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => String(values[name] ?? ""))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function sanitizePhoneNumber(phoneNumber = "") {
  return String(phoneNumber).replace(/[^\d+]/g, "").trim();
}

function normalizePhilippinesMobile(phoneNumber = "") {
  const raw = sanitizePhoneNumber(phoneNumber);
  if (!raw) {
    return "";
  }

  if (raw.startsWith("+63")) {
    return raw;
  }

  if (raw.startsWith("63")) {
    return `+${raw}`;
  }

  if (raw.startsWith("09") && raw.length === 11) {
    return `+63${raw.slice(1)}`;
  }

  if (raw.startsWith("9") && raw.length === 10) {
    return `+63${raw}`;
  }

  return raw.startsWith("+") ? raw : `+${raw}`;
}

function normalizeTwilioPhoneNumber(phoneNumber = "") {
  const raw = sanitizePhoneNumber(phoneNumber);
  if (!raw) {
    return "";
  }

  if (raw.startsWith("+")) {
    return raw;
  }

  if (raw.startsWith("09") && raw.length === 11) {
    return `+63${raw.slice(1)}`;
  }

  if (raw.startsWith("639") && raw.length === 12) {
    return `+${raw}`;
  }

  if (raw.startsWith("9") && raw.length === 10) {
    return `+63${raw}`;
  }

  return raw.startsWith("+") ? raw : `+${raw}`;
}

async function logSms({
  caseId = null,
  parentId = null,
  phoneNumber,
  message,
  deliveryStatus = "pending",
  failureReason = null,
  sentAt = null
}) {
  const [result] = await pool.query(
    `
    INSERT INTO sms_logs
    (case_id, parent_id, phone_number, message, delivery_status, failure_reason, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      caseId,
      parentId,
      phoneNumber,
      message,
      deliveryStatus,
      failureReason,
      sentAt
    ]
  );
  return result.insertId;
}

async function safeLogSms(logEntry) {
  try {
    return await logSms(logEntry);
  } catch (error) {
    console.error("SMS log error:", error);
    return null;
  }
}

function maskPhoneNumber(phoneNumber = "") {
  const value = String(phoneNumber || "");
  if (value.length <= 4) {
    return value ? "****" : "";
  }

  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function auditSmsAttempt({
  userId = null,
  ipAddress = null,
  smsLogId = null,
  caseId = null,
  parentId = null,
  phoneNumber = "",
  provider,
  status,
  failureReason = null,
  message = ""
}) {
  await logAudit({
    userId,
    action: "SMS_SEND_ATTEMPT",
    targetTable: "sms_logs",
    targetId: smsLogId,
    details: JSON.stringify({
      provider,
      status,
      caseId,
      parentId,
      recipient: maskPhoneNumber(phoneNumber),
      messageLength: String(message || "").length,
      failureReason
    }),
    ipAddress
  });
}

async function sendViaSemaphore(phoneNumber, message) {
  const apiKey = process.env.SMS_API_KEY;
  const senderName = process.env.SMS_SENDER_NAME || undefined;

  if (!apiKey) {
    throw new Error("SMS_API_KEY is not configured.");
  }

  const payload = new URLSearchParams({
    apikey: apiKey,
    number: phoneNumber,
    message
  });

  if (senderName) {
    payload.set("sendername", senderName);
  }

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(bodyText || `Semaphore request failed with status ${response.status}`);
  }

  return bodyText;
}

async function sendViaTwilio(phoneNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are incomplete. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.");
  }

  const to = normalizeTwilioPhoneNumber(phoneNumber);
  const from = normalizeTwilioPhoneNumber(fromNumber);
  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const payload = new URLSearchParams({
    To: to,
    From: from,
    Body: message
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(bodyText || `Twilio request failed with status ${response.status}`);
  }

  return bodyText;
}

async function sendViaPhilSms(phoneNumber, message) {
  const apiToken = process.env.PHILSMS_API_TOKEN;
  const senderId = process.env.PHILSMS_SENDER_ID || process.env.SMS_SENDER_NAME || "PhiltechGMA";

  if (!apiToken) {
    throw new Error("PHILSMS_API_TOKEN is not configured.");
  }

  const recipient = normalizePhilippinesMobile(phoneNumber);
  const response = await fetch("https://app.philsms.com/api/v3/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient,
      sender_id: senderId,
      type: "plain",
      message
    })
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(bodyText || `PhilSMS request failed with status ${response.status}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(bodyText || "PhilSMS returned an unreadable response.");
  }

  if (String(parsed.status || "").toLowerCase() !== "success") {
    throw new Error(parsed.message || bodyText || "PhilSMS did not accept the SMS request.");
  }

  return parsed;
}

async function sendSms({ caseId = null, parentId = null, phoneNumber, message, userId = null, ipAddress = null }) {
  const provider = getSmsProvider();
  const normalizedPhone = provider === "twilio"
    ? normalizeTwilioPhoneNumber(phoneNumber)
    : provider === "philsms"
      ? normalizePhilippinesMobile(phoneNumber)
      : sanitizePhoneNumber(phoneNumber);

  if (!normalizedPhone) {
    const smsLogId = await safeLogSms({
      caseId,
      parentId,
      phoneNumber: phoneNumber || "",
      message,
      deliveryStatus: "failed",
      failureReason: "Parent phone number is missing."
    });
    await auditSmsAttempt({
      userId,
      ipAddress,
      smsLogId,
      caseId,
      parentId,
      phoneNumber: phoneNumber || "",
      provider,
      status: "failed",
      failureReason: "Parent phone number is missing.",
      message
    });

    return {
      success: false,
      status: "failed",
      reason: "Parent phone number is missing."
    };
  }

  if (!isSmsEnabled()) {
    const smsLogId = await safeLogSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "failed",
      failureReason: "SMS sending is disabled."
    });
    await auditSmsAttempt({
      userId,
      ipAddress,
      smsLogId,
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      provider,
      status: "disabled",
      failureReason: "SMS sending is disabled.",
      message
    });

    return {
      success: false,
      status: "disabled",
      reason: "SMS sending is disabled."
    };
  }

  try {
    let providerResponse = null;
    switch (provider) {
      case "philsms":
        providerResponse = await sendViaPhilSms(normalizedPhone, message);
        break;
      case "twilio":
        providerResponse = await sendViaTwilio(normalizedPhone, message);
        break;
      case "semaphore":
      default:
        providerResponse = await sendViaSemaphore(normalizedPhone, message);
        break;
    }

    const smsLogId = await safeLogSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "sent",
      sentAt: new Date()
    });
    await auditSmsAttempt({
      userId,
      ipAddress,
      smsLogId,
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      provider,
      status: "sent",
      message
    });

    return {
      success: true,
      status: "sent",
      providerResponse
    };
  } catch (error) {
    const failureReason = error.message || "SMS provider request failed.";
    const smsLogId = await safeLogSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "failed",
      failureReason
    });
    await auditSmsAttempt({
      userId,
      ipAddress,
      smsLogId,
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      provider,
      status: "failed",
      failureReason,
      message
    });

    return {
      success: false,
      status: "failed",
      reason: failureReason
    };
  }
}

module.exports = {
  sendSms,
  isSmsEnabled,
  getSmsTemplates,
  renderSmsTemplate,
  SMS_TEMPLATE_CONFIG
};
