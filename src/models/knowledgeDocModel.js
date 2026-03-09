import mongoose from "mongoose";

const knowledgeDocSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: [
        "general",
        "symptoms",
        "treatments",
        "medications",
        "procedures",
        "policies",
        "faq",
        "other",
      ],
      default: "general",
    },
    sourceType: {
      type: String,
      enum: ["pdf", "text", "url"],
      required: true,
    },
    /** Original filename or URL */
    source: {
      type: String,
      trim: true,
    },
    /** Total character count of extracted text */
    textLength: {
      type: Number,
      default: 0,
    },
    /** Number of chunks stored in Pinecone */
    chunkCount: {
      type: Number,
      default: 0,
    },
    /** Pinecone namespace used for this doc's vectors */
    pineconeNamespace: {
      type: String,
      default: "default",
    },
    /** Upload / processing status */
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    errorMessage: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

knowledgeDocSchema.index({ category: 1, status: 1 });

export default mongoose.model("KnowledgeDoc", knowledgeDocSchema);
