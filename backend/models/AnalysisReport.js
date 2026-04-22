import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const AnalysisReport = sequelize.define(
  "AnalysisReport",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: "meetings", key: "id" } },
    clientName: { type: DataTypes.STRING, defaultValue: "" },
    productName: { type: DataTypes.STRING, defaultValue: "" },
    summary: { type: DataTypes.TEXT, defaultValue: "" },
    pros: { type: DataTypes.JSONB, defaultValue: [] },
    cons: { type: DataTypes.JSONB, defaultValue: [] },
    tips: { type: DataTypes.JSONB, defaultValue: [] },
    sentiment: {
      type: DataTypes.ENUM("positive", "neutral", "negative"),
      defaultValue: "neutral",
      allowNull: false
    },
    questionsDetected: { type: DataTypes.JSONB, defaultValue: [] },
    questionsCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    qaPairs: { type: DataTypes.JSONB, defaultValue: [] },
    demoQualityEvaluation: { type: DataTypes.TEXT, defaultValue: "" }
  },
  {
    tableName: "analysis_reports",
    timestamps: true,
    indexes: [{ fields: ["sentiment"] }]
  }
);
