import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const Recording = sequelize.define(
  "Recording",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false, references: { model: "meetings", key: "id" } },
    recordingUrl: { type: DataTypes.STRING, allowNull: true },
    filePath: { type: DataTypes.STRING, allowNull: true },
    duration: { type: DataTypes.FLOAT, allowNull: true, validate: { min: 0 } }
  },
  {
    tableName: "recordings",
    timestamps: true,
    indexes: [{ fields: ["meetingId"] }]
  }
);
