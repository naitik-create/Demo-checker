import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const Transcript = sequelize.define(
  "Transcript",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: "meetings", key: "id" } },
    transcriptText: { type: DataTypes.TEXT, allowNull: false }
  },
  { tableName: "transcripts", timestamps: true }
);
