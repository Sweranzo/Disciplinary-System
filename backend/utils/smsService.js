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

async function sendSms({ caseId = null, parentId = null, phoneNumber, message }) {
  const provider = getSmsProvider();
  const normalizedPhone = provider === "twilio"
    ? normalizeTwilioPhoneNumber(phoneNumber)
    : provider === "philsms"
      ? normalizePhilippinesMobile(phoneNumber)
      : sanitizePhoneNumber(phoneNumber);

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
      status: "sent",
      providerResponse
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
