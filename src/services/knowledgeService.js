import fs from "fs/promises";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse/lib/pdf-parse.js");
import KnowledgeDoc from "../models/knowledgeDocModel.js";

class KnowledgeService {
  /**
   * Ingest a document: extract text and store metadata.
   * Runs asynchronously after the upload response is sent.
   */
  async ingestDocument(docId, filePath, rawText) {
    const doc = await KnowledgeDoc.findById(docId);
    if (!doc) throw new Error("Document record not found.");

    try {
      // 1) Extract text
      let text = rawText || "";
      if (!text && filePath) {
        if (doc.sourceType === "pdf") {
          const buffer = await fs.readFile(filePath);
          const parsed = await pdf(buffer);
          text = parsed.text;
        } else {
          text = await fs.readFile(filePath, "utf-8");
        }
      }

      if (!text?.trim()) {
        doc.status = "failed";
        doc.errorMessage = "No text could be extracted from the document.";
        await doc.save();
        return;
      }

      doc.textLength = text.length;
      doc.status = "ready";
      doc.errorMessage = undefined;
      await doc.save();

      // Clean up temp file
      if (filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      console.log(`✅ Knowledge doc "${doc.title}" ingested`);
    } catch (err) {
      console.error(`❌ Ingestion failed for doc ${docId}:`, err.message);
      doc.status = "failed";
      doc.errorMessage = err.message;
      await doc.save();
    }
  }

  /**
   * Delete a knowledge document.
   */
  async deleteDocument(docId) {
    const doc = await KnowledgeDoc.findById(docId);
    if (!doc) throw new Error("Document not found.");

    await KnowledgeDoc.findByIdAndDelete(docId);
    return { message: "Document deleted." };
  }

  /**
   * List all knowledge documents.
   */
  async listDocuments({ category, status } = {}) {
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;

    return KnowledgeDoc.find(filter)
      .select("title description category sourceType textLength status createdAt")
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Get a single document's details.
   */
  async getDocument(docId) {
    const doc = await KnowledgeDoc.findById(docId).lean();
    if (!doc) throw new Error("Document not found.");
    return doc;
  }
}

export default new KnowledgeService();
