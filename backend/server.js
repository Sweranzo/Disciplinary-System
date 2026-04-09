const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const testRoutes = require("./routes/testRoutes");
const caseRoutes = require("./routes/caseRoutes");
const hearingRoutes = require("./routes/hearingRoutes");
const hearingViewRoutes = require("./routes/hearingViewRoutes");
const sanctionRoutes = require("./routes/sanctionRoutes");
const studentRoutes = require("./routes/studentRoutes");
const evidenceRoutes = require("./routes/evidenceRoutes");
const appealRoutes = require("./routes/appealRoutes");
const counselorRoutes = require("./routes/counselorRoutes");
const adminRoutes = require("./routes/adminRoutes");
const app = express();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Disciplinary System API is running"
  });
});

app.use("/api/sanctions", sanctionRoutes);
app.use("/api/hearing-view", hearingViewRoutes);
app.use("/api/hearings", hearingRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api/appeals", appealRoutes);
app.use("/api/counselor", counselorRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
