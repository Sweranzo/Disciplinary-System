const pool = require("../config/db");
const {
  getActorContext,
  getCaseForAccess
} = require("./caseController");

function normalizeBody(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function createNotification(userId, title, message, type = "case") {
  if (!userId) {
    return;
  }

  await pool.query(
    `
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (?, ?, ?, ?)
    `,
    [userId, title, message, type]
  );
}

async function requireCaseMessageAccess(caseId, user) {
  const context = await getActorContext(user);
  const caseItem = await getCaseForAccess(caseId, context);

  if (!caseItem) {
    return {
      allowed: false,
      status: 403,
      message: "You do not have access to this case conversation."
    };
  }

  return { allowed: true, caseItem };
}

async function getCaseConversationRecipients(caseId, currentUserId = null) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT user_id, role
    FROM (
      SELECT c.reported_by_user_id AS user_id, reporter.role
      FROM cases c
      JOIN users reporter ON c.reported_by_user_id = reporter.id
      WHERE c.id = ?

      UNION

      SELECT c.assigned_to_user_id AS user_id, assignee.role
      FROM cases c
      JOIN users assignee ON c.assigned_to_user_id = assignee.id
      WHERE c.id = ? AND c.assigned_to_user_id IS NOT NULL

      UNION

      SELECT s.user_id AS user_id, su.role
      FROM cases c
      JOIN students s ON c.student_id = s.id
      JOIN users su ON s.user_id = su.id
      WHERE c.id = ? AND s.user_id IS NOT NULL

      UNION

      SELECT p.user_id AS user_id, pu.role
      FROM cases c
      JOIN students s ON c.student_id = s.id
      JOIN student_parents sp ON sp.student_id = s.id
      JOIN parents p ON sp.parent_id = p.id
      JOIN users pu ON p.user_id = pu.id
      WHERE c.id = ? AND p.user_id IS NOT NULL
    ) recipients
    WHERE user_id IS NOT NULL
    `,
    [caseId, caseId, caseId, caseId]
  );

  if (currentUserId && !rows.some(row => Number(row.user_id) === Number(currentUserId))) {
    rows.push({ user_id: currentUserId, role: null });
  }

  return rows;
}

async function ensureCaseConversation(caseId, user) {
  const [existingRows] = await pool.query(
    `
    SELECT id, case_id, subject, status, created_at, updated_at
    FROM case_conversations
    WHERE case_id = ? AND status <> 'archived'
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [caseId]
  );

  let conversation = existingRows[0] || null;

  if (!conversation) {
    const [caseRows] = await pool.query(
      "SELECT case_number FROM cases WHERE id = ? LIMIT 1",
      [caseId]
    );
    const subject = `Case Conversation: ${caseRows[0]?.case_number || `#${caseId}`}`;
    const [result] = await pool.query(
      `
      INSERT INTO case_conversations (case_id, subject, created_by_user_id)
      VALUES (?, ?, ?)
      `,
      [caseId, subject, user.id]
    );
    conversation = {
      id: result.insertId,
      case_id: caseId,
      subject,
      status: "open"
    };
  }

  const recipients = await getCaseConversationRecipients(caseId, user.id);
  for (const recipient of recipients) {
    await pool.query(
      `
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE role = COALESCE(VALUES(role), role)
      `,
      [conversation.id, recipient.user_id, recipient.role]
    );
  }

  return conversation;
}

async function markConversationRead(conversationId, userId) {
  await pool.query(
    `
    UPDATE conversation_participants
    SET last_read_at = CURRENT_TIMESTAMP
    WHERE conversation_id = ? AND user_id = ?
    `,
    [conversationId, userId]
  );
}

async function getUnreadMessageCount(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) AS unread_count
      FROM case_messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      JOIN case_conversations cc ON cc.id = m.conversation_id
      WHERE cp.user_id = ?
        AND cc.status <> 'archived'
        AND m.deleted_at IS NULL
        AND m.sender_user_id <> ?
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      `,
      [req.user.id, req.user.id]
    );

    return res.json({
      success: true,
      unreadCount: Number(rows[0]?.unread_count || 0)
    });
  } catch (error) {
    console.error("Get unread messages error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching unread messages."
    });
  }
}

async function getMyConversations(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        cc.id,
        cc.case_id,
        cc.subject,
        cc.status,
        cc.updated_at,
        c.case_number,
        c.violation_type,
        s.student_number,
        COALESCE(su.first_name, s.first_name) AS student_first_name,
        COALESCE(su.last_name, s.last_name) AS student_last_name,
        latest.body AS latest_message,
        latest.created_at AS latest_message_at,
        sender.first_name AS latest_sender_first_name,
        sender.last_name AS latest_sender_last_name,
        (
          SELECT COUNT(*)
          FROM case_messages unread
          WHERE unread.conversation_id = cc.id
            AND unread.deleted_at IS NULL
            AND unread.sender_user_id <> ?
            AND (cp.last_read_at IS NULL OR unread.created_at > cp.last_read_at)
        ) AS unread_count
      FROM conversation_participants cp
      JOIN case_conversations cc ON cp.conversation_id = cc.id
      JOIN cases c ON cc.case_id = c.id
      JOIN students s ON c.student_id = s.id
      LEFT JOIN users su ON s.user_id = su.id
      LEFT JOIN case_messages latest ON latest.id = (
        SELECT cm.id
        FROM case_messages cm
        WHERE cm.conversation_id = cc.id AND cm.deleted_at IS NULL
        ORDER BY cm.created_at DESC, cm.id DESC
        LIMIT 1
      )
      LEFT JOIN users sender ON latest.sender_user_id = sender.id
      WHERE cp.user_id = ? AND cc.status <> 'archived'
      ORDER BY COALESCE(latest.created_at, cc.updated_at) DESC
      `,
      [req.user.id, req.user.id]
    );

    return res.json({
      success: true,
      conversations: rows.map(row => ({
        ...row,
        unread_count: Number(row.unread_count || 0)
      }))
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching conversations."
    });
  }
}

async function getCaseConversation(req, res) {
  try {
    const caseId = Number(req.params.caseId);
    const access = await requireCaseMessageAccess(caseId, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const conversation = await ensureCaseConversation(caseId, req.user);
    await markConversationRead(conversation.id, req.user.id);

    const [messages] = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.body,
        m.created_at,
        u.first_name,
        u.last_name,
        u.role
      FROM case_messages m
      JOIN users u ON m.sender_user_id = u.id
      WHERE m.conversation_id = ? AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC, m.id ASC
      `,
      [conversation.id]
    );

    const [participants] = await pool.query(
      `
      SELECT
        cp.user_id,
        cp.role,
        cp.last_read_at,
        u.first_name,
        u.last_name,
        u.username
      FROM conversation_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.conversation_id = ?
      ORDER BY u.first_name, u.last_name
      `,
      [conversation.id]
    );

    return res.json({
      success: true,
      conversation,
      participants,
      messages
    });
  } catch (error) {
    console.error("Get case conversation error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching case conversation."
    });
  }
}

async function sendCaseMessage(req, res) {
  try {
    const caseId = Number(req.params.caseId);
    const body = normalizeBody(req.body.body);

    if (!body || body.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Message must include at least 2 characters."
      });
    }

    if (body.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message must be 2,000 characters or fewer."
      });
    }

    const access = await requireCaseMessageAccess(caseId, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const conversation = await ensureCaseConversation(caseId, req.user);
    const [result] = await pool.query(
      `
      INSERT INTO case_messages (conversation_id, sender_user_id, body)
      VALUES (?, ?, ?)
      `,
      [conversation.id, req.user.id, body]
    );

    await pool.query(
      "UPDATE case_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [conversation.id]
    );
    await markConversationRead(conversation.id, req.user.id);

    const [caseRows] = await pool.query(
      "SELECT case_number FROM cases WHERE id = ? LIMIT 1",
      [caseId]
    );
    const caseNumber = caseRows[0]?.case_number || `case #${caseId}`;

    const [participantRows] = await pool.query(
      `
      SELECT user_id
      FROM conversation_participants
      WHERE conversation_id = ? AND user_id <> ?
      `,
      [conversation.id, req.user.id]
    );

    const senderName = [req.user.first_name, req.user.last_name].filter(Boolean).join(" ").trim()
      || req.user.username
      || "A case participant";

    for (const participant of participantRows) {
      await createNotification(
        participant.user_id,
        `New Message: ${caseNumber}`,
        `${senderName} sent a message in ${caseNumber}.`,
        "case"
      );
    }

    const [messageRows] = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.body,
        m.created_at,
        u.first_name,
        u.last_name,
        u.role
      FROM case_messages m
      JOIN users u ON m.sender_user_id = u.id
      WHERE m.id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "Message sent.",
      conversation,
      caseMessage: messageRows[0]
    });
  } catch (error) {
    console.error("Send case message error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending message."
    });
  }
}

module.exports = {
  getUnreadMessageCount,
  getMyConversations,
  getCaseConversation,
  sendCaseMessage
};
