import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(), // 🔥 Cloudinary-friendly
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png, webp) are allowed"));
    }
  },
});

export default upload;
