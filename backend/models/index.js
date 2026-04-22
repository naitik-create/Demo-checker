import { User } from "./User.js";
import { Meeting } from "./Meeting.js";
import { Transcript } from "./Transcript.js";
import { DemoScore } from "./DemoScore.js";
import { AnalysisReport } from "./AnalysisReport.js";
import { Recording } from "./Recording.js";
import { SttMeeting } from "./SttMeeting.js";

// Associations
Meeting.belongsTo(User, { foreignKey: "consultantId", as: "consultant" });
User.hasMany(Meeting, { foreignKey: "consultantId" });

Transcript.belongsTo(Meeting, { foreignKey: "meetingId" });
Meeting.hasOne(Transcript, { foreignKey: "meetingId" });

DemoScore.belongsTo(Meeting, { foreignKey: "meetingId" });
Meeting.hasOne(DemoScore, { foreignKey: "meetingId" });

AnalysisReport.belongsTo(Meeting, { foreignKey: "meetingId" });
Meeting.hasOne(AnalysisReport, { foreignKey: "meetingId" });

Recording.belongsTo(Meeting, { foreignKey: "meetingId" });
Meeting.hasMany(Recording, { foreignKey: "meetingId" });

export async function syncModels() {
  await User.sync({ alter: true });
  await Meeting.sync({ alter: true });
  await Transcript.sync({ alter: true });
  await DemoScore.sync({ alter: true });
  await AnalysisReport.sync({ alter: true });
  await Recording.sync({ alter: true });
  await SttMeeting.sync({ alter: true });
}

export { User, Meeting, Transcript, DemoScore, AnalysisReport, Recording, SttMeeting };
