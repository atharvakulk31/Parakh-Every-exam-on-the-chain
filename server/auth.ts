import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  users,
  getRefreshToken, setRefreshToken, deleteRefreshToken,
  getLockout, setLockout, deleteLockout,
  type Role,
} from "./store.js";
import { csrfTokenFor, rateLimit } from "./security.js";

// Single active session per user: new login invalidates all older tokens (in-memory, resets on restart)
const activeSessions = new Map<string, string>(); // userId -> sid

// Revoked refresh token families — in-memory is acceptable; these are per-session security tokens
export const revokedFamilies = new Set<string>();

const JWT_SECRET = process.env.JWT_SECRET || "parakh-dev-secret";
const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export interface AuthedRequest extends Request {
  user?: { id: string; role: Role; username: string; sid: string };
}

function issueTokens(user: { id: string; role: Role; username: string }, family?: string, sid?: string) {
  const sessionId = sid ?? crypto.randomUUID();
  activeSessions.set(user.id, sessionId);
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, username: user.username, sid: sessionId },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
  const refreshToken = crypto.randomBytes(32).toString("hex");
  setRefreshToken(refreshToken, {
    userId: user.id,
    family: family ?? crypto.randomUUID(),
    sid: sessionId,
    expiresAt: Date.now() + REFRESH_TTL_MS,
  });
  return { accessToken, refreshToken, csrfToken: csrfTokenFor(user.id, sessionId), sessionId };
}

export const authRouter = Router();

authRouter.post("/login", rateLimit(5, 60_000, "login"), (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  const lock = getLockout(username as string);
  if (lock?.lockedUntil && lock.lockedUntil > Date.now()) {
    const mins = Math.ceil((lock.lockedUntil - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked. Try again in ${mins} min.` });
  }

  const user = users.find((u) => u.username === username);
  const ok = user && bcrypt.compareSync(password as string, user.passwordHash);
  if (!ok) {
    const rec = getLockout(username as string) ?? { fails: 0, lockedUntil: null };
    rec.fails += 1;
    if (rec.fails >= MAX_FAILS) {
      rec.lockedUntil = Date.now() + LOCK_MS;
      rec.fails = 0;
    }
    setLockout(username as string, rec);
    return res.status(401).json({
      error: "Invalid credentials",
      attemptsRemaining: rec.lockedUntil ? 0 : MAX_FAILS - rec.fails,
    });
  }

  deleteLockout(username as string);
  const tokens = issueTokens(user);
  res.json({
    ...tokens,
    user: { id: user.id, username: user.username, role: user.role, name: user.name },
  });
});

authRouter.post("/refresh", (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

  const record = getRefreshToken(refreshToken as string);
  if (!record) {
    return res.status(401).json({ error: "Invalid or reused refresh token" });
  }
  if (revokedFamilies.has(record.family) || record.expiresAt < Date.now()) {
    deleteRefreshToken(refreshToken as string);
    return res.status(401).json({ error: "Refresh token expired or revoked" });
  }

  if (activeSessions.get(record.userId) !== record.sid) {
    deleteRefreshToken(refreshToken as string);
    return res.status(401).json({ error: "Session superseded by a newer sign-in" });
  }

  deleteRefreshToken(refreshToken as string);
  const user = users.find((u) => u.id === record.userId);
  if (!user) return res.status(401).json({ error: "Unknown user" });

  const tokens = issueTokens(user, record.family, record.sid);
  res.json({
    ...tokens,
    user: { id: user.id, username: user.username, role: user.role, name: user.name },
  });
});

export function requireAuth(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as jwt.JwtPayload;
      const user = { id: payload.sub as string, role: payload.role as Role, username: payload.username as string, sid: payload.sid as string };
      if (activeSessions.get(user.id) !== user.sid) {
        return res.status(401).json({ error: "Signed in elsewhere — this session was terminated" });
      }
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export function decodeUser(req: Request): { id: string; role: Role; sid: string } | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const p = jwt.verify(header.slice(7), JWT_SECRET) as jwt.JwtPayload;
    return { id: p.sub as string, role: p.role as Role, sid: p.sid as string };
  } catch {
    return null;
  }
}
