import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/demo_monitoring";

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: databaseUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false
  }
});
