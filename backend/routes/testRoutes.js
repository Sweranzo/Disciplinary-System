const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

router.get("/test-login", (req, res) => {
  res.json({
    message: "Test route working"
  });
});

router.get("/admin-only", verifyToken, allowRoles("admin"), (req, res) => {
  res.json({
    success: true,
    message: "Welcome Admin"
  });
});

router.get(
  "/discipline-only",
  verifyToken,
  allowRoles("discipline_officer"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Discipline Officer"
    });
  }
);

router.get(
  "/teacher-only",
  verifyToken,
  allowRoles("teacher"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Teacher"
    });
  }
);

router.get(
  "/guidance-only",
  verifyToken,
  allowRoles("guidance_counselor"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Guidance Counselor"
    });
  }
);

router.get(
  "/student-only",
  verifyToken,
  allowRoles("student"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Student"
    });
  }
);

router.get(
  "/parent-only",
  verifyToken,
  allowRoles("parent"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome Parent"
    });
  }
);

module.exports = router;