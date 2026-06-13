import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "parakh-dev-secret";

// ---- Rate limiting: in-memory sliding window per IP ----

const buckets = new Map<string, number[]>();

export function rateLimit(max: number, windowMs: number, name: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip ?? "unknown"}`;
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: `Rate limit: ${max}/${windowMs / 1000}s. Retry in ${retryAfter}s.` });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

// Periodic cleanup so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    const fresh = v.filter((t) => now - t < 5 * 60_000);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}, 60_000).unref();

// ---- CSRF: stateless double-submit token bound to user + session ----

export function csrfTokenFor(userId: string, sid: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(`csrf|${userId}|${sid}`).digest("hex");
}

// App-level CSRF guard. Caller supplies a decoder so this module stays
// import-cycle-free with auth.ts. Mutating, authenticated requests only —
// auth endpoints themselves are exempt (they MINT the token).
export function csrfProtect(decode: (req: Request) => { id: string; sid: string } | null) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.path.startsWith("/api/auth/")) return next();
    const user = decode(req);
    if (!user) return next(); // unauthenticated → requireAuth rejects downstream
    const token = req.headers["x-csrf-token"];
    if (typeof token !== "string" || token !== csrfTokenFor(user.id, user.sid)) {
      return res.status(403).json({ error: "Invalid or missing CSRF token" });
    }
    next();
  };
}

// ---- Security headers (CSP & friends) ----

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // Tailwind inlines styles
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
}
