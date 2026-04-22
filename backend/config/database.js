import { sequelize } from "./sequelize.js";

export async function connectDatabase() {
  await sequelize.authenticate();
  const { syncModels } = await import("../models/index.js");
  await syncModels();
  return sequelize;
}
