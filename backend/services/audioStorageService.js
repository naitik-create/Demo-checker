import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../uploads/meeting-audio");

export async function ensureAudioUploadsDir() {
  await fs.mkdir(uploadsRoot, { recursive: true });
}

export function getAudioUploadsDir() {
  return uploadsRoot;
}

export function toRelativeAudioPath(absPath) {
  return path.relative(path.resolve(__dirname, ".."), absPath).replace(/\\/g, "/");
}

