import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]); 
  
  if (allowed.has(file.mimetype)) return cb(null, true);

  // Your custom error handling is good
  cb(Object.assign(new Error("Only image files (jpeg, png, webp) are allowed"), { statusCode: 400 }));
};

const upload = multer({
  storage,
  // 👇 CHANGE THIS LINE
  limits: { fileSize: 5 * 1024 * 1024 }, // Increased to 5MB
  fileFilter,
});

export default upload;