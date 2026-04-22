import { Router } from "express";
import { login, profile, register, updateProfile } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

export const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.get("/profile", requireAuth, profile);
authRoutes.put("/profile", requireAuth, updateProfile);

