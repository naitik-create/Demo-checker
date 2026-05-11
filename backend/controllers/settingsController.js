import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { AppSetting } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logoFilePath(filename) {
  return path.join(__dirname, "../uploads/logo", path.basename(filename));
}

function deleteFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

// GET /api/settings/logo — returns both light and dark logo URLs
export async function getLogos(req, res, next) {
  try {
    const [light, dark] = await Promise.all([
      AppSetting.findOne({ where: { key: "logo" } }),
      AppSetting.findOne({ where: { key: "logo_dark" } })
    ]);
    res.json({ ok: true, logoUrl: light?.value || null, logoDarkUrl: dark?.value || null });
  } catch (err) {
    next(err);
  }
}

// Generic upload handler — key is "logo" or "logo_dark"
async function handleUpload(key, req, res, next) {
  try {
    if (!req.file) {
      const err = new Error("No file uploaded"); err.status = 400; throw err;
    }
    const existing = await AppSetting.findOne({ where: { key } });
    if (existing?.value) deleteFile(logoFilePath(existing.value));

    const logoUrl = `/uploads/logo/${req.file.filename}`;
    await AppSetting.upsert({ key, value: logoUrl });
    res.json({ ok: true, logoUrl });
  } catch (err) {
    next(err);
  }
}

// Generic delete handler
async function handleDelete(key, res, next) {
  try {
    const setting = await AppSetting.findOne({ where: { key } });
    if (setting?.value) deleteFile(logoFilePath(setting.value));
    await AppSetting.destroy({ where: { key } });
    res.json({ ok: true, logoUrl: null });
  } catch (err) {
    next(err);
  }
}

export const uploadLogo     = (req, res, next) => handleUpload("logo",      req, res, next);
export const uploadLogoDark = (req, res, next) => handleUpload("logo_dark", req, res, next);
export const deleteLogo     = (req, res, next) => handleDelete("logo",      res, next);
export const deleteLogoDark = (req, res, next) => handleDelete("logo_dark", res, next);
