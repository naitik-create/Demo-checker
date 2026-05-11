import { User } from "../models/index.js";

const DEFAULT_ADMIN = {
  name: "Admin",
  email: "admin",
  password: "M@t@d@t@",
  role: "manager",
  approvalStatus: "approved",
};

export async function seedAdminAccount() {
  const existing = await User.findOne({ where: { email: DEFAULT_ADMIN.email } });
  if (existing) {
    console.log("Default admin account already exists — skipping seed.");
    return;
  }
  await User.create(DEFAULT_ADMIN);
  console.log("✔  Default admin account created (email: admin)");
}
