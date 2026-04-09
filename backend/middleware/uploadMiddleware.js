const fs = require("fs");
const path = require("path");
const multer = require("multer");

const evidenceDir = path.join(__dirname, "..", "uploads", "evidence");
const avatarDir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(avatarDir, { recursive: true });

function sanitizeFileName(fileName = "evidence") {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, evidenceDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${sanitizeFileName(file.originalname)}`);
  }
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "") || ".png";
    cb(null, `avatar_${req.user?.id || "user"}_${Date.now()}${extension}`);
  }
});

const uploadEvidenceFile = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const uploadAvatarImage = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for avatars."));
    }
    cb(null, true);
  }
});

module.exports = { uploadEvidenceFile, uploadAvatarImage };
