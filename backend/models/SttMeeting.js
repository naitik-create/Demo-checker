import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const SttMeeting = sequelize.define(
  "SttMeeting",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.STRING, allowNull: false, unique: true },
    employeeId: { type: DataTypes.STRING, allowNull: false },
    audioPath: { type: DataTypes.STRING, defaultValue: "" },
    transcript: { type: DataTypes.TEXT, defaultValue: "" }
  },
  {
    tableName: "stt_meetings",
    timestamps: true,
    indexes: [{ fields: ["employeeId"] }]
  }
);
