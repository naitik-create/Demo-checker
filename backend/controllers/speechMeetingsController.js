import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { ensureAudioUploadsDir, getAudioUploadsDir, toRelativeAudioPath } from "../services/audioStorageService.js";
import {
  createMeetingSession,
  getMeetingById,
  updateMeetingAudioPath,
  updateMeetingTranscript
} from "../services/meetingSessionsRepository.js";
import { transcribeAudioFile } from "../services/azureSpeechToTextService.js";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const AUDIO_EXT = new Set([".mp3", ".mp4", ".wav", ".m4a"]);

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await ensureAudioUploadsDir();
      cb(null, getAudioUploadsDir());
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${req.params.meetingId}_${Date.now()}${ext || ".mp3"}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!AUDIO_EXT.has(ext)) {
    cb(badRequest("Only mp3/mp4/wav/m4a files are supported."), false);
    return;
  }
  cb(null, true);
}

export const uploadMeetingAudio = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.STT_MAX_UPLOAD_BYTES || 250 * 1024 * 1024) }
}).single("audio");

export async function startMeeting(req, res, next) {
  try {
    const employeeId = String(req.body?.employee_id || "").trim();
    if (!employeeId) throw badRequest("employee_id is required");

    const meetingId = uuidv4();
    const meeting = await createMeetingSession({ meetingId, employeeId });
    res.status(201).json({
      ok: true,
      meeting_id: meeting.id,
      employee_id: meeting.employee_id,
      created_at: meeting.created_at
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadAudioAndTranscribe(req, res, next) {
  try {
    const meetingId = String(req.params.meetingId || req.body?.meeting_id || "").trim();
    if (!meetingId) throw badRequest("meeting_id is required in URL");
    if (!req.file) throw badRequest("audio file is required (field name: audio)");

    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }

    const relAudioPath = toRelativeAudioPath(req.file.path);
    await updateMeetingAudioPath({ meetingId, audioPath: relAudioPath });

    const shouldAutoTranscribe = (process.env.STT_AUTO_TRANSCRIBE || "true") === "true";
    if (!shouldAutoTranscribe) {
      return res.json({
        ok: true,
        meeting_id: meetingId,
        audio_path: relAudioPath,
        transcription_status: "queued"
      });
    }

    const locale = String(req.body?.locale || "en-US");
    const { transcript, speakerHints } = await transcribeAudioFile({
      filePath: req.file.path,
      locale
    });
    await updateMeetingTranscript({ meetingId, transcript });

    res.json({
      ok: true,
      meeting_id: meetingId,
      audio_path: relAudioPath,
      transcript,
      speaker_hints: speakerHints,
      transcription_status: "completed"
    });
  } catch (err) {
    next(err);
  }
}

export async function getTranscript(req, res, next) {
  try {
    const meetingId = String(req.params.meetingId || "").trim();
    if (!meetingId) throw badRequest("meeting_id is required");
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      const err = new Error("Meeting not found");
      err.status = 404;
      throw err;
    }
    res.json({
      ok: true,
      meeting_id: meeting.id,
      employee_id: meeting.employee_id,
      audio_path: meeting.audio_path,
      transcript: meeting.transcript || "",
      created_at: meeting.created_at
    });
  } catch (err) {
    next(err);
  }
}

