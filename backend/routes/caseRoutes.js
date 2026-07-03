const express = require("express");
const router = express.Router();

const {
  createCase,
  getAllCases,
  getCaseById,
  addCaseUpdate,
  acknowledgeCaseNotice,
  checkRepeatViolation,
  getCaseUpdates,
  getCaseRepeatWarning,
  updateCaseStatus,
  reviewCaseReport,
  closeCaseWithChecklist,
  getCaseActionSummary,
  getCaseProcessAuditReport,
  handoffCaseToCounselor,
  requestMoreCaseInfo,
  resolveDuplicateCase,
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
  "/action-summary",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
  getCaseActionSummary
);

router.get(
  "/process-audit",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  getCaseProcessAuditReport
);

router.get(
  "/repeat-check",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor"),
  checkRepeatViolation
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

router.put(
  "/:id/review",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  reviewCaseReport
);

router.put(
  "/:id/close",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  closeCaseWithChecklist
);

router.post(
  "/:id/request-info",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  requestMoreCaseInfo
);

router.post(
  "/:id/resolve-duplicate",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  resolveDuplicateCase
);

router.post(
  "/:id/counseling-handoff",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  handoffCaseToCounselor
);

router.post(
  "/:id/acknowledge",
  verifyToken,
  allowRoles("student", "parent"),
  acknowledgeCaseNotice
);

router.get(
  "/:id/repeat-warning",
  verifyToken,
  allowRoles("admin", "teacher", "discipline_officer", "guidance_counselor"),
  getCaseRepeatWarning
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
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
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
