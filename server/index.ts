import "dotenv/config";
import express from "express";
import { authRouter, requireAuth, decodeUser } from "./auth.js";
import { auditMiddleware, getAuditLog } from "./audit.js";
import { questionsRouter } from "./routes/questions.js";
import { assembleRouter } from "./routes/assemble.js";
import { verifyRouter } from "./routes/verify.js";
import { questions, liveStats, centers, flags } from "./store.js";
import { db } from "./db.js";
import { getChain } from "./crypto.js";
import { centersRouter } from "./routes/centers.js";
import { proctoringRouter } from "./routes/proctoring.js";
import { securityHeaders, csrfProtect, rateLimit } from "./security.js";
import { evaluationRouter } from "./routes/evaluation.js";
import { reportRouter } from "./routes/report.js";
import { examRouter } from "./routes/exam.js";
import { paperComposeRouter } from "./routes/paperCompose.js";
import { seedDemoState } from "./seed.js";

seedDemoState();

const app = express();
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(auditMiddleware);
app.use(csrfProtect(decodeUser));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, claude: !!process.env.ANTHROPIC_API_KEY, time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/questions", questionsRouter);
app.use("/api/assemble", assembleRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/centers", centersRouter);
app.use("/api/proctoring", proctoringRouter);
app.use("/api/evaluation", evaluationRouter);
app.use("/api/report", reportRouter);
app.use("/api/exam", examRouter);
app.use("/api/paper-compose", paperComposeRouter);

app.get("/api/stats", requireAuth("teacher", "admin"), (_req, res) => {
  const blocked = (db.prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE status IN (401, 423)").get() as { cnt: number }).cnt;
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const bySubject = new Map<string, number>();
  let pending = 0;
  for (const q of questions) {
    byDifficulty[q.difficulty] += 1;
    bySubject.set(q.subject, (bySubject.get(q.subject) ?? 0) + 1);
    if (q.status === "pending") pending += 1;
  }
  const now = Date.now();
  const activity = Array.from({ length: 10 }, (_, i) => {
    const start = now - (10 - i) * 60_000;
    const end = start + 60_000;
    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE timestamp >= ? AND timestamp < ?").get(startIso, endIso) as { cnt: number }).cnt;
    return { minute: new Date(start).toISOString().slice(11, 16), requests: count };
  });
  res.json({
    leakAttemptsBlocked: blocked,
    proctoringFlags: flags.filter((f) => f.status === "open").length,
    centersLive: centers.filter((c) => c.status !== "idle").length,
    fairness: liveStats.lastFairness,
    papersAssembled: liveStats.papersAssembled,
    questionCount: questions.length,
    pendingQuestions: pending,
    chainLength: getChain().length,
    byDifficulty,
    bySubject: [...bySubject.entries()].map(([subject, count]) => ({ subject, count })),
    activity,
  });
});

app.get("/api/audit", rateLimit(3, 60_000, "admin-audit"), requireAuth("admin"), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ entries: getAuditLog(limit) });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Parakh API on http://localhost:${PORT} (Claude: ${process.env.ANTHROPIC_API_KEY ? "live" : "fallback mode"})`);
});
