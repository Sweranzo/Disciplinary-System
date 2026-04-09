const express = require("express");
const router = express.Router();

const {
  createAppeal,
  getMyAppeals,
  getAllAppeals,
  reviewAppeal
} = require("../controllers/appealController");

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.post(
  "/create",
  verifyToken,
  allowRoles("student"),
  createAppeal
);

router.get(
  "/my",
  verifyToken,
  allowRoles("student"),
  getMyAppeals
);

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor"),
  getAllAppeals
);

router.put(
  "/:id/review",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  reviewAppeal
);

module.exports = router;
