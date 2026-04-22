import jwt from "jsonwebtoken";
import { User } from "../models/index.js";

function unauthorized(message = "Unauthorized") {
  const err = new Error(message);
  err.status = 401;
  return err;
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");
    if (!token) throw unauthorized("Missing Bearer token");

    const secret = process.env.JWT_SECRET;
    if (!secret) throw unauthorized("JWT_SECRET is not configured");

    const payload = jwt.verify(token, secret);
    const userId = payload?.sub;
    if (!userId) throw unauthorized("Invalid token");

    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "name", "email", "role", "avatarUrl", "msUpn", "msTenantId", "msUserId", "msAccessTokenExpiresAt", "msRefreshToken"]
    });
    if (!user) throw unauthorized("User not found");

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || "",
      teamsConnected: Boolean(user.msRefreshToken),
      msUpn: user.msUpn || null,
      msTenantId: user.msTenantId || null,
      msUserId: user.msUserId || null,
      msAccessTokenExpiresAt: user.msAccessTokenExpiresAt || null
    };
    next();
  } catch (err) {
    if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
      return next(unauthorized("Invalid or expired token"));
    }
    next(err);
  }
}

export function requireRole(...roles) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user) return next(unauthorized());
    if (roles.length === 0) return next();
    if (!roles.includes(req.user.role)) {
      const err = new Error("Forbidden");
      err.status = 403;
      return next(err);
    }
    next();
  };
}
