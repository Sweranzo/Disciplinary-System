const express = require("express");
const router = express.Router();

const { createHearing, getAllHearings, updateHearing } = require("../controllers/hearingController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.post(
  "/create",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  createHearing
);

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
  getAllHearings
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  updateHearing
);

module.exports = router;
