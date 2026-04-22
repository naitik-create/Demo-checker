import { Router } from "express";
import { saveDemoScore } from "../controllers/demoScoresController.js";

export const demoScoresRoutes = Router();

// Save demo scores (each component 0-20) and store totalScore=sum
demoScoresRoutes.post("/save", saveDemoScore);

