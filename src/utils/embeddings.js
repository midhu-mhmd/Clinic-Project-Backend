import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
let embeddingModel = null;

if (GEMINI_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
}

/**
 * Generate an embedding vector for a single text string.
 * Returns a float array (768 dimensions for text-embedding-004).
 */
export async function generateEmbedding(text) {
  if (!embeddingModel) throw new Error("Embedding model not initialised (missing GEMINI_API_KEY).");
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values; // number[]
}

/**
 * Generate embeddings for an array of texts (batched).
 * Returns an array of float arrays in the same order.
 */
export async function generateEmbeddings(texts) {
  if (!embeddingModel) throw new Error("Embedding model not initialised (missing GEMINI_API_KEY).");
  const result = await embeddingModel.batchEmbedContents({
    requests: texts.map((text) => ({ content: { parts: [{ text }] } })),
  });
  return result.embeddings.map((e) => e.values);
}
