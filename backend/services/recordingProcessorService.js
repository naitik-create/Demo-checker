import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import axios from "axios";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);
}

async function downloadToFile(url, destPath) {
  const res = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    res.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function extractAudioWithFfmpeg({ videoPath, audioPath }) {
  // Requires ffmpeg to be installed and available in PATH
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      audioPath
    ];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const e = new Error(`ffmpeg failed with code ${code}`);
      e.details = stderr.slice(-4000);
      reject(e);
    });
  });
}

async function sendAudioToAiService({ audioPath }) {
  const baseUrl = process.env.AI_SERVICE_URL || "http://localhost:7000";
  const url = `${baseUrl.replace(/\/$/, "")}/transcribe`;

  const audioBytes = await fs.promises.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: "audio/wav" }), path.basename(audioPath));

  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || "AI service transcription failed");
    err.status = 502;
    throw err;
  }
  return json;
}

export async function processMeetingRecording({
  meetingId,
  recordingUrl,
  storageRoot = path.join(process.cwd(), "storage")
}) {
  if (!recordingUrl) {
    const err = new Error("recordingUrl is required");
    err.status = 400;
    throw err;
  }

  const recordingsDir = path.join(storageRoot, "recordings");
  const audioDir = path.join(storageRoot, "audio");
  ensureDir(recordingsDir);
  ensureDir(audioDir);

  const base = safeName(meetingId);
  const videoPath = path.join(recordingsDir, `${base}.mp4`);
  const audioPath = path.join(audioDir, `${base}.wav`);

  await downloadToFile(recordingUrl, videoPath);

  try {
    await extractAudioWithFfmpeg({ videoPath, audioPath });
  } catch (err) {
    const e = new Error(
      "Audio extraction failed. Ensure ffmpeg is installed and available in PATH."
    );
    e.status = 500;
    e.cause = err;
    throw e;
  }

  const aiResult = await sendAudioToAiService({ audioPath });

  return {
    videoPath,
    audioPath,
    aiResult
  };
}

