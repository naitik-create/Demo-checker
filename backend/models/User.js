import { DataTypes } from "sequelize";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/sequelize.js";

export const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: true },
    role: { type: DataTypes.ENUM("admin", "consultant", "manager"), defaultValue: "consultant", allowNull: false },
    approvalStatus: { type: DataTypes.ENUM("approved", "pending", "rejected"), defaultValue: "approved", allowNull: false },
    avatarUrl: { type: DataTypes.STRING, allowNull: true },

    msTenantId: { type: DataTypes.STRING, allowNull: true },
    msUserId: { type: DataTypes.STRING, allowNull: true },
    msUpn: { type: DataTypes.STRING, allowNull: true },
    msDisplayName: { type: DataTypes.STRING, allowNull: true },
    msJobTitle: { type: DataTypes.STRING, allowNull: true },
    msDepartment: { type: DataTypes.STRING, allowNull: true },
    msOfficeLocation: { type: DataTypes.STRING, allowNull: true },
    msRefreshToken: { type: DataTypes.TEXT, allowNull: true },
    msAccessToken: { type: DataTypes.TEXT, allowNull: true },
    msAccessTokenExpiresAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: "users",
    timestamps: true,
    hooks: {
      beforeSave: async (user) => {
        if (user.changed("password") && user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  }
);

User.prototype.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
