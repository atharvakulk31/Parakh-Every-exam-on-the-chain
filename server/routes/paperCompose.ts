import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { questions, papers, addPaper, updatePaper, setExamDuration, setExamStartAt, examConfig } from "../store.js";
import { appendBlock, sha256 } from "../crypto.js";

export const paperComposeRouter = Router();

// GET /api/paper-compose/questions — approved questions for manual selection
paperComposeRouter.get("/questions", requireAuth("teacher", "admin"), (_req, res) => {
  const approved = questions.filter((q) => q.status === "approved").map(({ correctAnswer: _ca, encryptedText: _enc, ...q }) => q);
  res.json({ questions: approved });
});

// GET /api/paper-compose/papers — all finalized papers
paperComposeRouter.get("/papers", requireAuth("teacher", "admin"), (_req, res) => {
  res.json({
    papers: papers.map((p) => ({
      paperId: p.paperId,
      title: p.title,
      subject: p.subject,
      questionCount: p.questionIds?.length ?? null,
      paperHash: p.paperHash,
      finalizedAt: p.finalizedAt,
      finalizedBy: p.finalizedBy,
      variantIds: p.variantIds,
    })),
  });
});

// POST /api/paper-compose/finalize
// Teacher composes + locks paper to hash chain
paperComposeRouter.post("/finalize", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const { title, subject, questionIds, durationMinutes, startAt } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Paper title required" });
  }
  if (!subject || typeof subject !== "string") {
    return res.status(400).json({ error: "Subject required" });
  }
  if (!Array.isArray(questionIds) || questionIds.length < 1) {
    return res.status(400).json({ error: "Select at least 1 question" });
  }
  const dur = Number(durationMinutes);
  if (!dur || dur < 10 || dur > 240) {
    return res.status(400).json({ error: "Duration must be 10–240 minutes" });
  }

  // Validate all question IDs exist and are approved
  const resolved = questionIds.map((id: string) => questions.find((q) => q.id === id && q.status === "approved"));
  const missing = questionIds.filter((_: string, i: number) => !resolved[i]);
  if (missing.length) {
    return res.status(400).json({ error: `Unknown or unapproved questions: ${missing.join(", ")}` });
  }

  // Deterministic paper hash — covers question IDs + title + subject
  const paperHash = sha256([...questionIds].sort().join("|") + "|" + title.trim() + "|" + subject);

  // Check for duplicate (same hash = same paper already exists)
  const duplicate = papers.find((p) => p.paperHash === paperHash);
  if (duplicate) {
    return res.status(409).json({ error: `Identical paper already exists: ${duplicate.paperId}` });
  }

  const paperId = `P-${Date.now().toString(36).toUpperCase()}`;
  const finalizedAt = new Date().toISOString();
  const finalizedBy = req.user!.id;

  addPaper({
    paperId,
    subject,
    variantIds: ["A"],          // single variant for manually composed papers
    questionIds,
    title: title.trim(),
    paperHash,
    finalizedBy,
    finalizedAt,
  });

  // Set exam duration
  setExamDuration(dur * 60_000);

  // Schedule exam start time if provided
  if (startAt) {
    const ts = typeof startAt === "string" ? Date.parse(startAt) : Number(startAt);
    if (!isNaN(ts) && ts > 0) setExamStartAt(ts);
  }

  // Lock to chain — only hash of question IDs (not the IDs themselves) for privacy
  const block = appendBlock("paper_finalized", {
    paperId,
    title: title.trim(),
    subject,
    paperHash,
    questionCount: questionIds.length,
    questionSetHash: sha256(questionIds.join(",")),
    durationMinutes: dur,
    finalizedBy,
    finalizedAt,
  });

  res.json({
    paperId,
    title: title.trim(),
    paperHash,
    questionCount: questionIds.length,
    durationMinutes: dur,
    startAt: examConfig.startAt,
    chainBlock: { index: block.index, hash: block.hash, timestamp: block.timestamp },
    message: "Paper locked to hash chain. Any tampering will break the chain.",
  });
});

// Fisher-Yates shuffle (in-place, returns array)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// POST /api/paper-compose/generate-variants
// Auto-distributes approved questions into N variants balanced by difficulty
paperComposeRouter.post("/generate-variants", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const { title, subject, numVariants, questionsPerVariant, durationMinutes, startAt } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim())
    return res.status(400).json({ error: "Paper title required" });
  if (!subject || typeof subject !== "string")
    return res.status(400).json({ error: "Subject required" });

  const nv = Number(numVariants);
  if (!Number.isInteger(nv) || nv < 2 || nv > 5)
    return res.status(400).json({ error: "numVariants must be 2–5" });

  const qpv = Number(questionsPerVariant);
  if (!Number.isInteger(qpv) || qpv < 5 || qpv > 60)
    return res.status(400).json({ error: "questionsPerVariant must be 5–60" });

  const dur = Number(durationMinutes);
  if (!dur || dur < 10 || dur > 240)
    return res.status(400).json({ error: "Duration must be 10–240 minutes" });

  // Pool: approved MCQ questions for this subject
  const pool = questions.filter(
    (q) => q.status === "approved" && q.subject.toLowerCase() === subject.toLowerCase() && q.options && q.options.length === 4
  );

  const totalNeeded = nv * qpv;
  if (pool.length < totalNeeded) {
    return res.status(400).json({
      error: `Not enough approved MCQ questions. Need ${totalNeeded} (${nv} variants × ${qpv} questions), have ${pool.length}.`,
    });
  }

  // Shuffle each difficulty bucket independently
  const easy   = shuffle(pool.filter((q) => q.difficulty === "easy"));
  const medium = shuffle(pool.filter((q) => q.difficulty === "medium"));
  const hard   = shuffle(pool.filter((q) => q.difficulty === "hard"));

  // Proportional targets per variant
  const total = easy.length + medium.length + hard.length;
  const easyPV   = Math.round(qpv * easy.length / total);
  const hardPV   = Math.round(qpv * hard.length / total);
  const mediumPV = qpv - easyPV - hardPV;

  // Validate enough questions in each bucket
  if (easy.length < easyPV * nv || medium.length < mediumPV * nv || hard.length < hardPV * nv) {
    return res.status(400).json({
      error: `Difficulty imbalance: need ${easyPV * nv} easy / ${mediumPV * nv} medium / ${hardPV * nv} hard. Have ${easy.length} / ${medium.length} / ${hard.length}.`,
    });
  }

  const VARIANT_LABELS = ["A", "B", "C", "D", "E"];
  const variantQuestionIds: Record<string, string[]> = {};
  const variantHashes: Record<string, string> = {};

  for (let v = 0; v < nv; v++) {
    const label = VARIANT_LABELS[v];
    // Splice from front of each shuffled bucket — each variant gets non-overlapping questions
    const picked = [
      ...easy.splice(0, easyPV),
      ...medium.splice(0, mediumPV),
      ...hard.splice(0, hardPV),
    ].map((q) => q.id);

    // Shuffle within variant to break difficulty-ordering pattern
    shuffle(picked);
    variantQuestionIds[label] = picked;
    variantHashes[label] = sha256([...picked].sort().join("|") + "|" + title.trim() + "|" + subject + "|" + label);
  }

  // Master paper hash covers all variant hashes
  const paperHash = sha256(Object.values(variantHashes).sort().join("|"));

  const duplicate = papers.find((p) => p.paperHash === paperHash);
  if (duplicate) {
    return res.status(409).json({ error: `Identical variant set already exists: ${duplicate.paperId}` });
  }

  const paperId = `P-${Date.now().toString(36).toUpperCase()}`;
  const finalizedAt = new Date().toISOString();
  const finalizedBy = req.user!.id;
  const variantIds = VARIANT_LABELS.slice(0, nv);

  addPaper({
    paperId,
    subject,
    variantIds,
    questionIds: null,           // not used — variantQuestionIds is the source of truth
    variantQuestionIds,
    title: title.trim(),
    paperHash,
    finalizedBy,
    finalizedAt,
  });

  setExamDuration(dur * 60_000);
  if (startAt) {
    const ts = typeof startAt === "string" ? Date.parse(startAt) : Number(startAt);
    if (!isNaN(ts) && ts > 0) setExamStartAt(ts);
  }

  const block = appendBlock("paper_finalized", {
    paperId,
    title: title.trim(),
    subject,
    paperHash,
    variants: variantIds,
    variantHashes,
    questionsPerVariant: qpv,
    durationMinutes: dur,
    finalizedBy,
    finalizedAt,
    mode: "auto-variant",
  });

  res.json({
    paperId,
    title: title.trim(),
    subject,
    paperHash,
    variants: variantIds,
    variantHashes,
    questionsPerVariant: qpv,
    durationMinutes: dur,
    startAt: examConfig.startAt,
    chainBlock: { index: block.index, hash: block.hash, timestamp: block.timestamp },
    message: `${nv} variants generated. Each variant has unique question ordering — no two variants share the same sequence.`,
  });
});

// GET /api/paper-compose/status — current exam config summary for scheduling UI
paperComposeRouter.get("/status", requireAuth("teacher", "admin"), (_req, res) => {
  const latest = papers.length ? papers[papers.length - 1] : null;
  res.json({
    latestPaper: latest ? {
      paperId: latest.paperId,
      title: latest.title,
      subject: latest.subject,
      paperHash: latest.paperHash,
      questionCount: latest.questionIds?.length ?? null,
      finalizedAt: latest.finalizedAt,
    } : null,
    examStartAt: examConfig.startAt,
    examDuration: examConfig.duration,
    serverNow: Date.now(),
  });
});
