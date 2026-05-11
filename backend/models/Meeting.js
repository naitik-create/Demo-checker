import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const Meeting = sequelize.define(
  "Meeting",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    teamsMeetingId: { type: DataTypes.STRING, allowNull: false, unique: true },
    consultantId: { type: DataTypes.UUID, allowNull: false, references: { model: "users", key: "id" } },
    participants: { type: DataTypes.JSONB, defaultValue: [] },
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM("scheduled", "in_progress", "completed", "cancelled"),
      defaultValue: "scheduled",
      allowNull: false
    },
    monitored: { type: DataTypes.BOOLEAN, defaultValue: false },
    joinedFromSystem: { type: DataTypes.BOOLEAN, defaultValue: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
    transcriptStatus: {
      type: DataTypes.ENUM("not_requested", "pending", "ready", "failed"),
      defaultValue: "not_requested",
      allowNull: false
    },
    analysisStatus: {
      type: DataTypes.ENUM("not_started", "pending", "completed", "failed"),
      defaultValue: "not_started",
      allowNull: false
    },
    autoAnalyzedAt: { type: DataTypes.DATE, allowNull: true },
    isDemo: { type: DataTypes.BOOLEAN, defaultValue: false },
    raw: { type: DataTypes.JSONB, allowNull: true }
  },
  {
    tableName: "meetings",
    timestamps: true,
    indexes: [
      { fields: ["consultantId"] },
      { fields: ["startTime"] },
      { fields: ["status"] },
      { fields: ["monitored"] },
      { fields: ["transcriptStatus"] },
      { fields: ["analysisStatus"] }
    ]
  }
);
