const express = require("express");
const router = express.Router();

const {
  getAllStudents,
  lookupStudentForReporting,
  getStudentProfileById,
  getMyStudentProfile,
  getLinkedChildrenOverview,
  updateStudentProfile,
  createStudent,
  deactivateStudent,
  getParentOptions,
  linkParentToStudent
} = require("../controllers/studentController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  getAllStudents
);

router.get(
  "/reporting-lookup",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
  lookupStudentForReporting
);

router.post(
  "/create",
  verifyToken,
  allowRoles("admin"),
  createStudent
);

router.get(
  "/me",
  verifyToken,
  allowRoles("student"),
  getMyStudentProfile
);

router.get(
  "/linked-children",
  verifyToken,
  allowRoles("parent"),
  getLinkedChildrenOverview
);

router.get(
  "/parent-options",
  verifyToken,
  allowRoles("admin"),
  getParentOptions
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  getStudentProfileById
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  updateStudentProfile
);

router.put(
  "/:id/deactivate",
  verifyToken,
  allowRoles("admin"),
  deactivateStudent
);

router.post(
  "/:id/link-parent",
  verifyToken,
  allowRoles("admin"),
  linkParentToStudent
);

module.exports = router;
