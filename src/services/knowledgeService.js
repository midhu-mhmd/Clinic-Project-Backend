import fs from "fs/promises";
import pdf from "pdf-parse/lib/pdf-parse.js";
import KnowledgeDoc from "../models/knowledgeDocModel.js";
import { pineconeIndex } from "../config/pinecone.js";
import { generateEmbeddings } from "../utils/embeddings.js";
import { chunkText } from "../utils/chunker.js";

const BATCH_SIZE = 50; // Pinecone upsert batch limit

class KnowledgeService {
  /**
   * Ingest a document: extract text → chunk → embed → upsert to Pinecone.
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

      // 2) Chunk
      const chunks = chunkText(text);
      doc.chunkCount = chunks.length;

      // 3) Generate embeddings (batched)
      const vectors = [];
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const embeddings = await generateEmbeddings(batch);

        for (let j = 0; j < batch.length; j++) {
          vectors.push({
            id: `${docId}_chunk_${i + j}`,
            values: embeddings[j],
            metadata: {
              docId: docId.toString(),
              title: doc.title,
              category: doc.category,
              chunkIndex: i + j,
              text: batch[j].slice(0, 3500), // Pinecone metadata limit ~40KB
            },
          });
        }
      }

      // 4) Upsert into Pinecone
      const ns = pineconeIndex.namespace(doc.pineconeNamespace);
      for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
        await ns.upsert(vectors.slice(i, i + BATCH_SIZE));
      }

      doc.status = "ready";
      doc.errorMessage = undefined;
      await doc.save();

      // 5) Clean up temp file
      if (filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      console.log(`✅ Knowledge doc "${doc.title}" ingested — ${chunks.length} chunks`);
    } catch (err) {
      console.error(`❌ Ingestion failed for doc ${docId}:`, err.message);
      doc.status = "failed";
      doc.errorMessage = err.message;
      await doc.save();
    }
  }

  /**
   * Delete a knowledge document and its vectors from Pinecone.
   */
  async deleteDocument(docId) {
    const doc = await KnowledgeDoc.findById(docId);
    if (!doc) throw new Error("Document not found.");

    // Delete vectors by ID prefix
    if (pineconeIndex && doc.chunkCount > 0) {
      const ns = pineconeIndex.namespace(doc.pineconeNamespace);
      const ids = Array.from({ length: doc.chunkCount }, (_, i) => `${docId}_chunk_${i}`);
      // Pinecone supports batch delete by IDs
      for (let i = 0; i < ids.length; i += 1000) {
        await ns.deleteMany(ids.slice(i, i + 1000));
      }
    }

    await KnowledgeDoc.findByIdAndDelete(docId);
    return { message: "Document and vectors deleted." };
  }

  /**
   * List all knowledge documents.
   */
  async listDocuments({ category, status } = {}) {
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;

    return KnowledgeDoc.find(filter)
      .select("title description category sourceType textLength chunkCount status createdAt")
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
