import jwt from "jsonwebtoken";
import { User } from "../models/index.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw badRequest("JWT_SECRET is not configured");
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign({ role: user.role }, secret, { subject: user.id.toString(), expiresIn });
}

export async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name) throw badRequest("name is required");
    if (!email) throw badRequest("email is required");
    if (!password) throw badRequest("password is required");

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ where: { email: normalizedEmail }, attributes: ["id"] });
    if (existing) {
      const err = new Error("Email already in use");
      err.status = 409;
      throw err;
    }

    const assignedRole = role === "manager" ? "manager" : "consultant";
    const approvalStatus = assignedRole === "manager" ? "pending" : "approved";

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: String(password),
      role: assignedRole,
      approvalStatus
    });

    // Manager accounts need approval before they can log in
    if (approvalStatus === "pending") {
      return res.status(201).json({
        ok: true,
        pending: true,
        message: "Your manager account has been created and is awaiting approval from an existing manager."
      });
    }

    const token = signToken(user);
    res.status(201).json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email) throw badRequest("email is required");
    if (!password) throw badRequest("password is required");

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      const err = new Error("Invalid credentials");
      err.status = 401;
      throw err;
    }

    const ok = await user.comparePassword(String(password));
    if (!ok) {
      const err = new Error("Invalid credentials");
      err.status = 401;
      throw err;
    }

    if (user.approvalStatus === "pending") {
      const err = new Error("Your account is pending approval by an existing manager. You will be able to log in once approved.");
      err.status = 403;
      throw err;
    }
    if (user.approvalStatus === "rejected") {
      const err = new Error("Your account registration was rejected. Please contact your administrator.");
      err.status = 403;
      throw err;
    }

    const token = signToken(user);
    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
}

export async function profile(req, res) {
  res.json({ ok: true, user: req.user });
}

export async function updateProfile(req, res, next) {
  try {
    const { avatarUrl } = req.body || {};
    const updates = {};
    if (avatarUrl !== undefined) updates.avatarUrl = String(avatarUrl).trim();

    if (Object.keys(updates).length > 0) {
      await User.update(updates, { where: { id: req.user.id } });
      req.user = { ...req.user, ...updates };
    }
    res.json({ ok: true, user: req.user });
  } catch (err) {
    next(err);
  }
}
