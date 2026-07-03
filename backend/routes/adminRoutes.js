const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  listUsers,
  createUser,
  updateUser,
  updateUserStatus,
  listAuditLogs,
  deleteAuditLog,
  clearAuditLogs,
  listSmsLogs,
  deleteSmsLog,
  clearSmsLogs,
  deleteUser,
  resetPassword,
  listParents,
  getParentOptions,
  getStudentOptions,
  createParent,
  updateParent,
  createStudent,
  deleteStudent,
  createStudentAccount,
  createParentAccount,
  linkParentToStudentAdmin,
  scanStudentMasterlist,
  bulkImport,
  bulkDeleteStudents,
  linkExistingUserToProfile
} = require("../controllers/adminIdentityController");
const {
  getSmsSettings,
  updateSemaphoreSettings,
  getEmailSettings,
  updateEmailSettings
} = require("../controllers/adminSettingsController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//i.test(file.mimetype)) {
      return cb(new Error("Only image files can be scanned."));
    }
    return cb(null, true);
  }
});

router.use(verifyToken, allowRoles("admin"));

router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.put("/users/:id/status", updateUserStatus);
router.delete("/users/:id", deleteUser);
router.put("/users/:id/reset-password", resetPassword);
router.post("/users/:id/link-profile", linkExistingUserToProfile);

router.get("/parents", listParents);
router.get("/parents/options", getParentOptions);
router.post("/parents", createParent);
router.put("/parents/:id", updateParent);
router.post("/parents/:id/create-account", createParentAccount);

router.get("/students/options", getStudentOptions);
router.post("/students", createStudent);
router.post("/students/:id/create-account", createStudentAccount);

router.post("/links/parent-student", linkParentToStudentAdmin);
router.post("/students/masterlist-ocr", upload.single("masterlist"), scanStudentMasterlist);
router.post("/bulk-import", bulkImport);
router.delete("/students/bulk-delete", bulkDeleteStudents);
router.delete("/students/:id", deleteStudent);
router.get("/audit-logs", listAuditLogs);
router.delete("/audit-logs/:id", deleteAuditLog);
router.delete("/audit-logs", clearAuditLogs);
router.get("/sms-logs", listSmsLogs);
router.delete("/sms-logs/:id", deleteSmsLog);
router.delete("/sms-logs", clearSmsLogs);
router.get("/sms-settings", getSmsSettings);
router.put("/sms-settings/semaphore", updateSemaphoreSettings);
router.get("/email-settings", getEmailSettings);
router.put("/email-settings", updateEmailSettings);

module.exports = router;
