import crypto from "crypto";
import { User, Meeting, Transcript, DemoScore, AnalysisReport, Recording } from "../models/index.js";

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

export async function listPendingManagers(req, res, next) {
  try {
    const pending = await User.findAll({
      where: { role: "manager", approvalStatus: "pending" },
      attributes: ["id", "name", "email", "createdAt"],
      order: [["createdAt", "ASC"]]
    });
    res.json({ ok: true, pending: pending.map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })) });
  } catch (err) { next(err); }
}

export async function approveManager(req, res, next) {
  try {
    const { managerId } = req.params;
    const user = await User.findOne({ where: { id: managerId, role: "manager" } });
    if (!user) { const e = new Error("Manager not found"); e.status = 404; throw e; }
    await user.update({ approvalStatus: "approved" });
    res.json({ ok: true, message: `${user.name}'s account has been approved. They can now log in.` });
  } catch (err) { next(err); }
}

export async function rejectManager(req, res, next) {
  try {
    const { managerId } = req.params;
    const user = await User.findOne({ where: { id: managerId, role: "manager" } });
    if (!user) { const e = new Error("Manager not found"); e.status = 404; throw e; }
    await user.update({ approvalStatus: "rejected" });
    res.json({ ok: true, message: `${user.name}'s account has been rejected.` });
  } catch (err) { next(err); }
}

export async function resetConsultantPassword(req, res, next) {
  try {
    const { consultantId } = req.params;
    const { newPassword } = req.body || {};

    if (!consultantId) throw badRequest("consultantId is required");
    if (!newPassword || String(newPassword).trim().length < 6)
      throw badRequest("New password must be at least 6 characters");

    const user = await User.findOne({ where: { id: consultantId, role: "consultant" } });
    if (!user) {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }

    await user.update({ password: String(newPassword) });

    res.json({ ok: true, message: `Password reset successfully for ${user.name}` });
  } catch (err) {
    next(err);
  }
}

export async function deleteConsultant(req, res, next) {
  try {
    const { consultantId } = req.params;
    const user = await User.findOne({ where: { id: consultantId, role: "consultant" } });
    if (!user) {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }

    // Cascade delete: meetings and all child records
    const meetings = await Meeting.findAll({ where: { consultantId }, attributes: ["id"] });
    const meetingIds = meetings.map((m) => m.id);

    if (meetingIds.length > 0) {
      await Transcript.destroy({ where: { meetingId: meetingIds } });
      await DemoScore.destroy({ where: { meetingId: meetingIds } });
      await AnalysisReport.destroy({ where: { meetingId: meetingIds } });
      await Recording.destroy({ where: { meetingId: meetingIds } });
      await Meeting.destroy({ where: { id: meetingIds } });
    }

    const name = user.name;
    await user.destroy();
    res.json({ ok: true, message: `${name} has been deleted.` });
  } catch (err) {
    next(err);
  }
}
