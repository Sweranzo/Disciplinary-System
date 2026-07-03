const fs = require("fs/promises");
const path = require("path");
const { logAudit } = require("../utils/auditLogger");
const { getSmsTemplates, SMS_TEMPLATE_CONFIG } = require("../utils/smsService");

const ENV_PATH = path.join(__dirname, "..", ".env");
const ENV_EXAMPLE_PATH = path.join(__dirname, "..", ".env.example");
const SMS_PROVIDER = "semaphore";
const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = "465";

function boolFromEnv(value) {
  return String(value || "").toLowerCase() === "true";
}

function maskSecret(value = "") {
  const secret = String(value || "");
  if (!secret) return "";
  if (secret.length <= 4) return "****";
  return `${"*".repeat(Math.min(secret.length - 4, 12))}${secret.slice(-4)}`;
}

function cleanSingleLine(value = "") {
  return String(value || "").replace(/[\r\n]/g, "").trim();
}

function normalizeTemplate(value = "") {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ").trim();
}

function formatEnvValue(value = "") {
  const clean = cleanSingleLine(value);
  if (!clean) return "";
  if (/^[A-Za-z0-9_./:@+-]+$/.test(clean)) return clean;
  return `"${clean.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function readEnvFile() {
  try {
    return await fs.readFile(ENV_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    return await fs.readFile(ENV_EXAMPLE_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function parseEnvContent(content = "") {
  const values = {};
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return;

    let value = match[2] || "";
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);
    }

    values[match[1]] = value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  });
  return values;
}

async function readEnvValues() {
  return parseEnvContent(await readEnvFile());
}

function upsertEnv(content, updates) {
  const lines = content ? content.split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = lines.map(line => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !Object.prototype.hasOwnProperty.call(updates, match[1])) {
      return line;
    }

    seen.add(match[1]);
    return `${match[1]}=${formatEnvValue(updates[match[1]])}`;
  });

  Object.keys(updates).forEach(key => {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(updates[key])}`);
    }
  });

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

function getSmsSettingsSnapshot() {
  const apiKey = process.env.SMS_API_KEY || "";
  return {
    smsEnabled: boolFromEnv(process.env.SMS_ENABLED),
    provider: process.env.SMS_PROVIDER || SMS_PROVIDER,
    senderName: process.env.SMS_SENDER_NAME || "",
    hasApiKey: Boolean(apiKey),
    maskedApiKey: maskSecret(apiKey),
    templates: getSmsTemplates()
  };
}

async function getEmailSettingsSnapshot() {
  const envValues = await readEnvValues();
  const readValue = key => (
    Object.prototype.hasOwnProperty.call(envValues, key) ? envValues[key] : process.env[key]
  );
  const password = readValue("SMTP_PASSWORD") || "";
  return {
    emailEnabled: boolFromEnv(readValue("EMAIL_ENABLED")),
    smtpHost: readValue("SMTP_HOST") || DEFAULT_SMTP_HOST,
    smtpPort: readValue("SMTP_PORT") || DEFAULT_SMTP_PORT,
    smtpSecure: readValue("SMTP_SECURE") === undefined ? true : boolFromEnv(readValue("SMTP_SECURE")),
    smtpUser: readValue("SMTP_USER") || "",
    fromEmail: readValue("SMTP_FROM_EMAIL") || readValue("SMTP_USER") || "",
    fromName: readValue("SMTP_FROM_NAME") || "Philtech-GMA",
    frontendUrl: readValue("FRONTEND_URL") || readValue("PORTAL_URL") || "",
    hasPassword: Boolean(password),
    maskedPassword: maskSecret(password)
  };
}

async function getSmsSettings(req, res) {
  return res.json({
    success: true,
    settings: getSmsSettingsSnapshot()
  });
}

async function getEmailSettings(req, res) {
  return res.json({
    success: true,
    settings: await getEmailSettingsSnapshot()
  });
}

async function updateSemaphoreSettings(req, res) {
  try {
    const smsEnabled = Boolean(req.body.smsEnabled);
    const senderName = cleanSingleLine(req.body.senderName || "");
    const apiKey = cleanSingleLine(req.body.apiKey || "");
    const clearApiKey = Boolean(req.body.clearApiKey);
    const templates = req.body.templates && typeof req.body.templates === "object" ? req.body.templates : {};

    if (!senderName) {
      return res.status(400).json({
        success: false,
        message: "Sender name is required."
      });
    }

    const hasEffectiveApiKey = clearApiKey ? false : Boolean(apiKey || process.env.SMS_API_KEY);
    if (smsEnabled && !hasEffectiveApiKey) {
      return res.status(400).json({
        success: false,
        message: "Semaphore API key is required before SMS can be enabled."
      });
    }

    const updates = {
      SMS_ENABLED: smsEnabled ? "true" : "false",
      SMS_PROVIDER: SMS_PROVIDER,
      SMS_SENDER_NAME: senderName
    };

    if (apiKey || clearApiKey) {
      updates.SMS_API_KEY = clearApiKey ? "" : apiKey;
    }

    Object.entries(SMS_TEMPLATE_CONFIG).forEach(([key, config]) => {
      if (!Object.prototype.hasOwnProperty.call(templates, key)) {
        return;
      }

      const templateValue = normalizeTemplate(templates[key]);
      updates[config.envKey] = templateValue || config.defaultValue;
    });

    const currentEnv = await readEnvFile();
    await fs.writeFile(ENV_PATH, upsertEnv(currentEnv, updates), "utf8");

    process.env.SMS_ENABLED = updates.SMS_ENABLED;
    process.env.SMS_PROVIDER = updates.SMS_PROVIDER;
    process.env.SMS_SENDER_NAME = updates.SMS_SENDER_NAME;
    if (Object.prototype.hasOwnProperty.call(updates, "SMS_API_KEY")) {
      process.env.SMS_API_KEY = updates.SMS_API_KEY;
    }
    Object.entries(SMS_TEMPLATE_CONFIG).forEach(([, config]) => {
      if (Object.prototype.hasOwnProperty.call(updates, config.envKey)) {
        process.env[config.envKey] = updates[config.envKey];
      }
    });

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_SMS_SETTINGS",
      targetTable: "system_settings",
      details: JSON.stringify({
        provider: SMS_PROVIDER,
        smsEnabled,
        senderName,
        apiKeyChanged: Boolean(apiKey || clearApiKey),
        apiKeyCleared: clearApiKey,
        templateKeysChanged: Object.keys(templates).filter(key => SMS_TEMPLATE_CONFIG[key])
      }),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Semaphore SMS settings saved successfully.",
      settings: getSmsSettingsSnapshot()
    });
  } catch (error) {
    console.error("Update Semaphore settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving SMS settings."
    });
  }
}

async function updateEmailSettings(req, res) {
  try {
    const emailEnabled = Boolean(req.body.emailEnabled);
    const smtpHost = cleanSingleLine(req.body.smtpHost || DEFAULT_SMTP_HOST);
    const smtpPort = cleanSingleLine(req.body.smtpPort || DEFAULT_SMTP_PORT);
    const smtpSecure = Boolean(req.body.smtpSecure);
    const smtpUser = cleanSingleLine(req.body.smtpUser || "");
    const smtpPassword = cleanSingleLine(req.body.smtpPassword || "").replace(/\s+/g, "");
    const clearSmtpPassword = Boolean(req.body.clearSmtpPassword);
    const fromEmail = cleanSingleLine(req.body.fromEmail || smtpUser);
    const fromName = cleanSingleLine(req.body.fromName || "Philtech-GMA");
    const frontendUrl = cleanSingleLine(req.body.frontendUrl || "");

    if (!smtpHost) {
      return res.status(400).json({
        success: false,
        message: "SMTP host is required."
      });
    }

    const portNumber = Number(smtpPort);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return res.status(400).json({
        success: false,
        message: "SMTP port must be a valid port number."
      });
    }

    const hasEffectivePassword = clearSmtpPassword ? false : Boolean(smtpPassword || process.env.SMTP_PASSWORD);
    if (emailEnabled && (!smtpUser || !hasEffectivePassword || !fromEmail)) {
      return res.status(400).json({
        success: false,
        message: "SMTP user, app password, and from email are required before email can be enabled."
      });
    }

    const updates = {
      EMAIL_ENABLED: emailEnabled ? "true" : "false",
      SMTP_HOST: smtpHost,
      SMTP_PORT: String(portNumber),
      SMTP_SECURE: smtpSecure ? "true" : "false",
      SMTP_USER: smtpUser,
      SMTP_FROM_EMAIL: fromEmail,
      SMTP_FROM_NAME: fromName,
      FRONTEND_URL: frontendUrl
    };

    if (smtpPassword || clearSmtpPassword) {
      updates.SMTP_PASSWORD = clearSmtpPassword ? "" : smtpPassword;
    }

    const currentEnv = await readEnvFile();
    await fs.writeFile(ENV_PATH, upsertEnv(currentEnv, updates), "utf8");

    Object.entries(updates).forEach(([key, value]) => {
      process.env[key] = value;
    });

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_EMAIL_SETTINGS",
      targetTable: "system_settings",
      details: JSON.stringify({
        emailEnabled,
        smtpHost,
        smtpPort: String(portNumber),
        smtpSecure,
        smtpUserChanged: Boolean(smtpUser),
        fromEmail,
        fromName,
        frontendUrl,
        passwordChanged: Boolean(smtpPassword || clearSmtpPassword),
        passwordCleared: clearSmtpPassword
      }),
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Email settings saved successfully.",
      settings: await getEmailSettingsSnapshot()
    });
  } catch (error) {
    console.error("Update email settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving email settings."
    });
  }
}

module.exports = {
  getSmsSettings,
  updateSemaphoreSettings,
  getEmailSettings,
  updateEmailSettings
};
