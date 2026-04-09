const express = require("express");
const router = express.Router();

const {
  listUsers,
  createUser,
  updateUser,
  updateUserStatus,
  listAuditLogs,
  deleteUser,
  resetPassword,
  listParents,
  getParentOptions,
  getStudentOptions,
  createParent,
  updateParent,
  createStudent,
  createStudentAccount,
  createParentAccount,
  linkParentToStudentAdmin,
  bulkImport,
  linkExistingUserToProfile
} = require("../controllers/adminIdentityController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

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
router.post("/bulk-import", bulkImport);
router.get("/audit-logs", listAuditLogs);

module.exports = router;
