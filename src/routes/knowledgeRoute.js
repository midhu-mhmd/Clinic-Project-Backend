import express from "express";
import multer from "multer";
import KnowledgeController from "../controllers/knowledgeController.js";
import { protectAuth, restrictTo } from "../middlewares/authMiddleware.js";

const knowledgeRouter = express.Router();

// Multer config – memory storage, 20 MB limit, PDF + text only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
    ]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PDF and plain text files are supported."));
  },
});

// All routes require admin auth
knowledgeRouter.use(protectAuth, restrictTo("SUPER_ADMIN", "ADMIN"));

// Upload & ingest a document
knowledgeRouter.post("/upload", upload.single("file"), KnowledgeController.uploadDocument);

// List all documents
knowledgeRouter.get("/documents", KnowledgeController.listDocuments);

// Single document details
knowledgeRouter.get("/documents/:id", KnowledgeController.getDocument);

// Delete document + vectors
knowledgeRouter.delete("/documents/:id", KnowledgeController.deleteDocument);

export default knowledgeRouter;
