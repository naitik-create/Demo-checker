import { DataTypes } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export const AppSetting = sequelize.define(
  "AppSetting",
  {
    key: { type: DataTypes.STRING(100), primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    tableName: "app_settings",
    timestamps: true
  }
);
