import KnowledgeService from "../services/knowledgeService.js";
import KnowledgeDoc from "../models/knowledgeDocModel.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;

class KnowledgeController {
  /**
   * POST /api/knowledge/upload
   * Upload a PDF or text document for RAG ingestion.
   * Accepts multipart/form-data with field "file", or JSON body with "text".
   */
  uploadDocument = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { title, description, category } = req.body;

      if (!title?.trim()) {
        return res.status(400).json({ success: false, message: "Title is required." });
      }

      let doc;
      let filePath = null;
      let rawText = null;

      if (req.file) {
        // File upload (PDF or text)
        const mime = req.file.mimetype;
        const isPdf = mime === "application/pdf";
        const isText = mime === "text/plain" || mime === "text/markdown";

        if (!isPdf && !isText) {
          return res.status(400).json({
            success: false,
            message: "Only PDF and plain text files are supported.",
          });
        }

        doc = await KnowledgeDoc.create({
          title: title.trim(),
          description: description?.trim(),
          category: category || "general",
          sourceType: isPdf ? "pdf" : "text",
          source: req.file.originalname,
          uploadedBy: userId,
        });

        // For memory storage: buffer is in req.file.buffer
        if (isPdf) {
          // Write buffer to temp file for pdf-parse
          const { writeFile, mkdtemp } = await import("fs/promises");
          const { join } = await import("path");
          const { tmpdir } = await import("os");
          const tmpDir = await mkdtemp(join(tmpdir(), "kb-"));
          filePath = join(tmpDir, req.file.originalname);
          await writeFile(filePath, req.file.buffer);
        } else {
          rawText = req.file.buffer.toString("utf-8");
        }
      } else if (req.body.text) {
        // Direct text submission
        rawText = req.body.text;
        doc = await KnowledgeDoc.create({
          title: title.trim(),
          description: description?.trim(),
          category: category || "general",
          sourceType: "text",
          source: "direct-input",
          uploadedBy: userId,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Provide a file upload or text content.",
        });
      }

      // Respond immediately, ingest in background
      res.status(201).json({ success: true, document: doc });

      // Fire-and-forget ingestion
      KnowledgeService.ingestDocument(doc._id, filePath, rawText).catch((err) =>
        console.error("Background ingestion error:", err.message)
      );
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to upload document.",
      });
    }
  };

  /**
   * GET /api/knowledge/documents
   */
  listDocuments = async (req, res) => {
    try {
      const { category, status } = req.query;
      const documents = await KnowledgeService.listDocuments({ category, status });
      return res.status(200).json({ success: true, documents });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to list documents.",
      });
    }
  };

  /**
   * GET /api/knowledge/documents/:id
   */
  getDocument = async (req, res) => {
    try {
      const document = await KnowledgeService.getDocument(req.params.id);
      return res.status(200).json({ success: true, document });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Document not found.",
      });
    }
  };

  /**
   * DELETE /api/knowledge/documents/:id
   */
  deleteDocument = async (req, res) => {
    try {
      const result = await KnowledgeService.deleteDocument(req.params.id);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to delete document.",
      });
    }
  };
}

export default new KnowledgeController();
