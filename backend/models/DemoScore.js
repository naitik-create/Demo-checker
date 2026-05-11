import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const DemoScore = sequelize.define(
  "DemoScore",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: "meetings", key: "id" } },
    discoveryScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    rapportScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    demoScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    objectionsScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    engagementScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    closeScore: { type: DataTypes.FLOAT, defaultValue: 0 },
    riskDeduction: { type: DataTypes.FLOAT, defaultValue: 0 },
    weightedTotal: { type: DataTypes.FLOAT, defaultValue: 0 },
    totalScore: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 100 } }
  },
  {
    tableName: "demo_scores",
    timestamps: true,
    hooks: {
      beforeSave: (doc) => {
        const sum = (doc.discoveryScore || 0) + (doc.rapportScore || 0) + (doc.demoScore || 0) + 
                    (doc.objectionsScore || 0) + (doc.engagementScore || 0) + (doc.closeScore || 0);
        doc.weightedTotal = sum;
        const adjusted = sum - (doc.riskDeduction || 0);
        doc.totalScore = Math.max(0, Math.min(100, Math.round((adjusted / 445) * 100)));
      }
    }
  }
);
