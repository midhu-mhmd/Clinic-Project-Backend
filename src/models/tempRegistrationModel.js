import mongoose from "mongoose";

const tempRegistrationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // Auto-delete after 10 mins
});

const TempRegistration = mongoose.model("TempRegistration", tempRegistrationSchema);

export default TempRegistration;
