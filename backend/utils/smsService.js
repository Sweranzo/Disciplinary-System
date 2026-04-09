const pool = require("../config/db");

function isSmsEnabled() {
  return String(process.env.SMS_ENABLED || "").toLowerCase() === "true";
}

function getSmsProvider() {
  return String(process.env.SMS_PROVIDER || "semaphore").trim().toLowerCase();
}

function sanitizePhoneNumber(phoneNumber = "") {
  return String(phoneNumber).replace(/[^\d+]/g, "").trim();
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
  await pool.query(
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

async function sendSms({ caseId = null, parentId = null, phoneNumber, message }) {
  const normalizedPhone = sanitizePhoneNumber(phoneNumber);

  if (!normalizedPhone) {
    await logSms({
      caseId,
      parentId,
      phoneNumber: phoneNumber || "",
      message,
      deliveryStatus: "failed",
      failureReason: "Parent phone number is missing."
    });

    return {
      success: false,
      status: "failed",
      reason: "Parent phone number is missing."
    };
  }

  if (!isSmsEnabled()) {
    await logSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "failed",
      failureReason: "SMS sending is disabled."
    });

    return {
      success: false,
      status: "disabled",
      reason: "SMS sending is disabled."
    };
  }

  try {
    switch (getSmsProvider()) {
      case "semaphore":
      default:
        await sendViaSemaphore(normalizedPhone, message);
        break;
    }

    await logSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "sent",
      sentAt: new Date()
    });

    return {
      success: true,
      status: "sent"
    };
  } catch (error) {
    await logSms({
      caseId,
      parentId,
      phoneNumber: normalizedPhone,
      message,
      deliveryStatus: "failed",
      failureReason: error.message || "SMS provider request failed."
    });

    return {
      success: false,
      status: "failed",
      reason: error.message || "SMS provider request failed."
    };
  }
}

module.exports = {
  sendSms,
  isSmsEnabled
};
