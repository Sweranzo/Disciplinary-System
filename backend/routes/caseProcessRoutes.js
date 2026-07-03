const express = require("express");
const router = express.Router();

const {
  addHearingAttendee,
  addPolicyReference,
  addStatement,
  addWitness,
  checkReportCompleteness,
  completeSanction,
  createDecision,
  exportCasePacket,
  getAppealEligibility,
  getFormalProcess,
  getSlaReport,
  listReportDrafts,
  reviewDecision,
  saveReportDraft
} = require("../controllers/caseProcessController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.post("/drafts", verifyToken, allowRoles("teacher"), saveReportDraft);
router.get("/drafts", verifyToken, allowRoles("teacher"), listReportDrafts);
router.post(
  "/report-completeness",
  verifyToken,
  allowRoles("teacher", "admin", "discipline_officer"),
  checkReportCompleteness
);

router.get(
  "/sla",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  getSlaReport
);

router.get(
  "/cases/:caseId",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher", "student", "parent"),
  getFormalProcess
);
router.post(
  "/cases/:caseId/witnesses",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
  addWitness
);
router.post(
  "/cases/:caseId/statements",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher", "student", "parent"),
  addStatement
);
router.post(
  "/cases/:caseId/policies",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  addPolicyReference
);
router.post(
  "/cases/:caseId/decisions",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  createDecision
);
router.get(
  "/cases/:caseId/appeal-eligibility",
  verifyToken,
  allowRoles("admin", "discipline_officer", "student", "parent"),
  getAppealEligibility
);
router.get(
  "/cases/:caseId/packet",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  exportCasePacket
);

router.put("/decisions/:decisionId/review", verifyToken, allowRoles("admin"), reviewDecision);
router.post(
  "/hearings/:hearingId/attendees",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  addHearingAttendee
);
router.put(
  "/sanctions/:sanctionId/complete",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  completeSanction
);

module.exports = router;
