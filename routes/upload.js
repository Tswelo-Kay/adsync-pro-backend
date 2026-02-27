const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/auth');

// Where to save files and what to name them
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

// Only allow images and videos
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images and videos allowed!'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/upload
router.post('/', protect, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  return res.status(200).json({ success: true, url: fileUrl, filename: req.file.filename });
});

module.exports = router;