import { Router } from "express";
import {
  getTranscript,
  startMeeting,
  uploadAudioAndTranscribe,
  uploadMeetingAudio
} from "../controllers/speechMeetingsController.js";

export const speechMeetingsRoutes = Router();

speechMeetingsRoutes.post("/start-meeting", startMeeting);
speechMeetingsRoutes.post("/upload-audio", uploadMeetingAudio, uploadAudioAndTranscribe);
speechMeetingsRoutes.post("/upload-audio/:meetingId", uploadMeetingAudio, uploadAudioAndTranscribe);
speechMeetingsRoutes.get("/transcript/:meetingId", getTranscript);

