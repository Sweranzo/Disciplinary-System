const express = require("express");
const router = express.Router();

const {
  createCase,
  getAllCases,
  getCaseById,
  addCaseUpdate,
  getCaseUpdates,
  updateCaseStatus,
  assignCase,
  claimCase,
  getCaseSummary,
  getMyStudentCases,
  getParentChildCases
} = require("../controllers/caseController");

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.post(
  "/create",
  verifyToken,
  allowRoles("teacher", "discipline_officer", "admin"),
  createCase
);

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor"),
  getAllCases
);

router.get(
  "/summary",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor"),
  getCaseSummary
);

router.get(
  "/my-cases",
  verifyToken,
  allowRoles("student"),
  getMyStudentCases
);

router.get(
  "/parent-child-cases",
  verifyToken,
  allowRoles("parent"),
  getParentChildCases
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor", "student", "parent"),
  getCaseById
);

router.post(
  "/:id/updates",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  addCaseUpdate
);  

router.get(
  "/:id/updates",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor"),
  getCaseUpdates
);

router.put(
  "/:id/status",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  updateCaseStatus
);

router.put(
  "/:id/assign",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  assignCase
);

router.put(
  "/:id/claim",
  verifyToken,
  allowRoles("discipline_officer"),
  claimCase
);
module.exports = router;
