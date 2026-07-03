const express = require("express");
const router = express.Router();

const {
  getUnreadMessageCount,
  getMyConversations,
  getCaseConversation,
  sendCaseMessage
} = require("../controllers/messageController");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/unread-count", verifyToken, getUnreadMessageCount);
router.get("/conversations", verifyToken, getMyConversations);
router.get("/cases/:caseId", verifyToken, getCaseConversation);
router.post("/cases/:caseId/messages", verifyToken, sendCaseMessage);

module.exports = router;
