const express = require("express");
const router = express.Router();
const {
  login,
  getMe,
  updateMyProfile,
  changeMyPassword,
  uploadMyAvatar,
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification,
  clearMyNotifications,
  getStaffOptions
} = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { uploadAvatarImage } = require("../middleware/uploadMiddleware");

router.post("/login", login);
router.get("/me", verifyToken, getMe);
router.put("/profile", verifyToken, updateMyProfile);
router.put("/password", verifyToken, changeMyPassword);
router.post("/avatar", verifyToken, uploadAvatarImage.single("avatar"), uploadMyAvatar);
router.get("/staff-options", verifyToken, allowRoles("admin", "discipline_officer"), getStaffOptions);
router.get("/notifications", verifyToken, getMyNotifications);
router.put("/notifications/read-all", verifyToken, markAllNotificationsAsRead);
router.put("/notifications/:id/read", verifyToken, markNotificationAsRead);
router.delete("/notifications/:id", verifyToken, deleteNotification);
router.delete("/notifications", verifyToken, clearMyNotifications);

module.exports = router;
