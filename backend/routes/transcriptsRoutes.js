import { Router } from "express";
import { saveTranscript } from "../controllers/transcriptsController.js";

export const transcriptsRoutes = Router();

transcriptsRoutes.post("/save", saveTranscript);

