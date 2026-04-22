import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const DemoScore = sequelize.define(
  "DemoScore",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: "meetings", key: "id" } },
    communicationScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 20 } },
    engagementScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 20 } },
    structureScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 20 } },
    technicalScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 20 } },
    qaScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 20 } },
    totalScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 100 } }
  },
  {
    tableName: "demo_scores",
    timestamps: true,
    hooks: {
      beforeSave: (doc) => {
        const scores = [doc.communicationScore, doc.engagementScore, doc.structureScore, doc.technicalScore, doc.qaScore]
          .map((n) => (typeof n === "number" ? n : 0));
        doc.totalScore = scores.reduce((a, b) => a + b, 0);
      }
    }
  }
);
