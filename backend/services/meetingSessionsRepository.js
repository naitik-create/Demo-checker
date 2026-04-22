import { SttMeeting } from "../models/index.js";

export async function createMeetingSession({ meetingId, employeeId }) {
  const doc = await SttMeeting.create({ meetingId, employeeId, audioPath: "", transcript: "" });
  return { id: doc.meetingId, employee_id: doc.employeeId, audio_path: doc.audioPath, transcript: doc.transcript, created_at: doc.createdAt };
}

export async function updateMeetingAudioPath({ meetingId, audioPath }) {
  const [count] = await SttMeeting.update({ audioPath }, { where: { meetingId } });
  if (!count) return null;
  const doc = await SttMeeting.findOne({ where: { meetingId } });
  return { id: doc.meetingId, employee_id: doc.employeeId, audio_path: doc.audioPath, transcript: doc.transcript, created_at: doc.createdAt };
}

export async function updateMeetingTranscript({ meetingId, transcript }) {
  const [count] = await SttMeeting.update({ transcript }, { where: { meetingId } });
  if (!count) return null;
  const doc = await SttMeeting.findOne({ where: { meetingId } });
  return { id: doc.meetingId, employee_id: doc.employeeId, audio_path: doc.audioPath, transcript: doc.transcript, created_at: doc.createdAt };
}

export async function getMeetingById(meetingId) {
  const doc = await SttMeeting.findOne({ where: { meetingId } });
  if (!doc) return null;
  return { id: doc.meetingId, employee_id: doc.employeeId, audio_path: doc.audioPath, transcript: doc.transcript, created_at: doc.createdAt };
}
