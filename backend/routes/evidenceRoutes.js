const express = require("express");
const router = express.Router();

const {
  uploadEvidence,
  getCaseEvidence,
  reviewEvidence,
  getAllEvidence
} = require("../controllers/evidenceController");

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { uploadEvidenceFile } = require("../middleware/uploadMiddleware");

router.post(
  "/upload",
  verifyToken,
  allowRoles("admin", "discipline_officer", "teacher"),
  uploadEvidenceFile.single("file"),
  uploadEvidence
);

router.get(
  "/case/:caseId",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher", "student", "parent"),
  getCaseEvidence
);

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  getAllEvidence
);

router.put(
  "/:id/review",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  reviewEvidence
);

module.exports = router;
