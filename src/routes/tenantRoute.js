import express from "express";
import { createTenant } from "../controllers/tenantController.js";

const tenantRoute = express.Router();
tenantRoute.post("/clinic-register", createTenant);

export default tenantRoute;