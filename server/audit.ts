import type { Request, Response, NextFunction } from "express";
import { addAudit, getAuditEntries } from "./store.js";
import { decodeUser } from "./auth.js";

const ACTION_MAP: Record<string, string> = {
  "POST /api/auth/login": "LOGIN_ATTEMPT",
  "POST /api/auth/refresh": "TOKEN_REFRESH",
  "GET /api/questions": "QUESTIONS_READ",
  "POST /api/questions": "QUESTION_SUBMIT",
  "POST /api/assemble": "PAPER_ASSEMBLE",
  "GET /api/verify": "CHAIN_VERIFY",
  "POST /api/verify": "RECORD_VERIFY",
  "GET /api/audit": "AUDIT_READ",
};

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
  res.on("finish", () => {
    const user = decodeUser(req);
    addAudit({
      timestamp: new Date(started).toISOString(),
      userId: user?.id ?? null,
      role: user?.role ?? null,
      ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
      method: req.method,
      path: req.originalUrl,
      action: ACTION_MAP[route] ?? "REQUEST",
      status: res.statusCode,
    });
  });
  next();
}

export function getAuditLog(limit = 100) {
  return getAuditEntries(limit);
}
