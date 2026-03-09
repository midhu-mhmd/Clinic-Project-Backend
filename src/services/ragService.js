import { pineconeIndex } from "../config/pinecone.js";
import { generateEmbedding } from "../utils/embeddings.js";

const TOP_K = 5; // Number of relevant chunks to retrieve
const SCORE_THRESHOLD = 0.5; // Minimum similarity score

class RagService {
  /**
   * Query Pinecone for relevant knowledge chunks.
   *
   * @param {string} question  – The user's question / message
   * @param {object} opts
   * @param {string} opts.namespace   – Pinecone namespace (default "default")
   * @param {string} opts.category    – Optional category filter
   * @param {number} opts.topK        – Number of results (default 5)
   * @returns {{ context: string, sources: object[] }}
   */
  async query(question, { namespace = "default", category, topK = TOP_K } = {}) {
    if (!pineconeIndex) {
      return { context: "", sources: [] };
    }

    // 1) Embed the user question
    const queryEmbedding = await generateEmbedding(question);

    // 2) Build Pinecone query
    const queryParams = {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    };

    if (category) {
      queryParams.filter = { category: { $eq: category } };
    }

    const ns = pineconeIndex.namespace(namespace);
    const results = await ns.query(queryParams);

    // 3) Filter by score threshold and build context
    const relevant = (results.matches || []).filter((m) => m.score >= SCORE_THRESHOLD);

    if (relevant.length === 0) {
      return { context: "", sources: [] };
    }

    const contextParts = relevant.map(
      (m, i) => `[Source ${i + 1}: ${m.metadata.title}]\n${m.metadata.text}`
    );

    const sources = relevant.map((m) => ({
      docId: m.metadata.docId,
      title: m.metadata.title,
      category: m.metadata.category,
      score: Math.round(m.score * 100) / 100,
      chunkIndex: m.metadata.chunkIndex,
    }));

    return {
      context: contextParts.join("\n\n---\n\n"),
      sources,
    };
  }
}

export default new RagService();
