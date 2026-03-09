/**
 * Split text into overlapping chunks for embedding.
 *
 * @param {string} text       – Source document text
 * @param {object} opts
 * @param {number} opts.chunkSize    – Target characters per chunk (default 1000)
 * @param {number} opts.chunkOverlap – Overlap between consecutive chunks (default 200)
 * @returns {string[]} array of text chunks
 */
export function chunkText(text, { chunkSize = 1000, chunkOverlap = 200 } = {}) {
  if (!text || typeof text !== "string") return [];

  // Normalise whitespace
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (clean.length <= chunkSize) return [clean];

  // Split on paragraph boundaries first, then sentences
  const paragraphs = clean.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from the end of previous chunk
      const overlapText = current.slice(-chunkOverlap);
      current = overlapText + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Safety: if any single chunk still exceeds 2x chunkSize, hard-split it
  const final = [];
  for (const chunk of chunks) {
    if (chunk.length > chunkSize * 2) {
      for (let i = 0; i < chunk.length; i += chunkSize - chunkOverlap) {
        final.push(chunk.slice(i, i + chunkSize).trim());
      }
    } else {
      final.push(chunk);
    }
  }

  return final.filter((c) => c.length > 0);
}
