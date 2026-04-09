const express = require("express");
const router = express.Router();

const {
  getCounselorDashboard,
  getCounselorCases,
  getCounselorInterventions,
  createCounselorIntervention,
  updateCounselorIntervention
} = require("../controllers/counselorController");

const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.get(
  "/dashboard",
  verifyToken,
  allowRoles("guidance_counselor"),
  getCounselorDashboard
);

router.get(
  "/cases",
  verifyToken,
  allowRoles("guidance_counselor"),
  getCounselorCases
);

router.get(
  "/interventions",
  verifyToken,
  allowRoles("guidance_counselor"),
  getCounselorInterventions
);

router.post(
  "/interventions",
  verifyToken,
  allowRoles("guidance_counselor"),
  createCounselorIntervention
);

router.put(
  "/interventions/:id",
  verifyToken,
  allowRoles("guidance_counselor"),
  updateCounselorIntervention
);

module.exports = router;
