import { Pinecone } from "@pinecone-database/pinecone";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "healthbook-knowledge";

let pineconeIndex = null;

if (PINECONE_API_KEY) {
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  pineconeIndex = pc.index(PINECONE_INDEX);
  console.log(`✅ Pinecone connected to index: ${PINECONE_INDEX}`);
} else {
  console.warn("⚠️  PINECONE_API_KEY not set — RAG disabled");
}

export { pineconeIndex, PINECONE_INDEX };
