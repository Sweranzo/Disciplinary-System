const express = require("express");
const router = express.Router();
const {
  getMyStudentHearings,
  getParentChildHearings
} = require("../controllers/hearingViewController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.get(
  "/my-hearings",
  verifyToken,
  allowRoles("student"),
  getMyStudentHearings
);

router.get(
  "/parent-child-hearings",
  verifyToken,
  allowRoles("parent"),
  getParentChildHearings
);

module.exports = router;