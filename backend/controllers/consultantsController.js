import crypto from "crypto";
import { User } from "../models/index.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function createConsultant(req, res, next) {
  try {
    const { name, email } = req.body || {};
    if (!name) throw badRequest("name is required");
    if (!email) throw badRequest("email is required");

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ where: { email: normalizedEmail }, attributes: ["id"] });
    if (existing) {
      const err = new Error("Email already exists");
      err.status = 409;
      throw err;
    }

    const randomPassword = crypto.randomBytes(24).toString("hex");
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: randomPassword,
      role: "consultant"
    });

    res.status(201).json({
      ok: true,
      consultant: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamsConnected: Boolean(user.msRefreshToken),
        msUpn: user.msUpn || null
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function listConsultants(req, res, next) {
  try {
    const consultants = await User.findAll({
      where: { role: "consultant" },
      attributes: ["id", "name", "email", "role", "msUpn", "msRefreshToken", "createdAt"],
      order: [["createdAt", "DESC"]]
    });

    res.json({
      ok: true,
      consultants: consultants.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        teamsConnected: Boolean(u.msRefreshToken),
        msUpn: u.msUpn || null,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function getConsultant(req, res, next) {
  try {
    const { consultantId } = req.params;
    if (!consultantId) throw badRequest("consultantId is required");

    const u = await User.findOne({
      where: { id: consultantId, role: "consultant" },
      attributes: ["id", "name", "email", "role", "msUpn", "msRefreshToken", "createdAt"]
    });

    if (!u) {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }

    res.json({
      ok: true,
      consultant: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        teamsConnected: Boolean(u.msRefreshToken),
        msUpn: u.msUpn || null,
        createdAt: u.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}
