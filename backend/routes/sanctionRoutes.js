const express = require("express");
const router = express.Router();

const {
  createSanction,
  getMySanctions,
  getParentSanctions,
  getAllSanctions,
  updateSanction
} = require("../controllers/sanctionController");
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.post(
  "/create",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  createSanction
);

router.get(
  "/my",
  verifyToken,
  allowRoles("student"),
  getMySanctions
);

router.get(
  "/parent",
  verifyToken,
  allowRoles("parent"),
  getParentSanctions
);

router.get(
  "/all",
  verifyToken,
  allowRoles("admin", "discipline_officer", "guidance_counselor", "teacher"),
  getAllSanctions
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin", "discipline_officer"),
  updateSanction
);

module.exports = router;
