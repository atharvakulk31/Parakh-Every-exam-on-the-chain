import { Router } from "express";
import { scripts, updateScript, examConfig, setExamState, getAllSubmissions, gradeSubmission, getAnswerKey, questions } from "../store.js";
import { appendBlock, sha256 } from "../crypto.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const evaluationRouter = Router();

evaluationRouter.get("/scripts", requireAuth("teacher", "admin"), (_req, res) => {
  res.json({
    scripts,
    pending: scripts.filter((s) => s.status === "pending").length,
  });
});

evaluationRouter.post("/scripts/:code", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const marks = Number(req.body?.marks);
  if (!Number.isFinite(marks) || marks < 0 || marks > 13) {
    return res.status(400).json({ error: "marks must be a number between 0 and 13" });
  }
  const script = scripts.find((s) => s.code === req.params.code);
  if (!script) return res.status(404).json({ error: "Script not found" });
  if (script.status === "evaluated") return res.status(409).json({ error: "Already evaluated" });

  updateScript(script.code, { status: "evaluated", marks, evaluatedBy: req.user!.id });
  appendBlock("script_evaluated", { scriptCode: script.code, marks, evaluatedBy: req.user!.id });
  res.json(script);
});

// GET /api/evaluation/state — exam lifecycle state + submission counts
evaluationRouter.get("/state", requireAuth("teacher", "admin"), (_req, res) => {
  const subs = getAllSubmissions();
  res.json({
    examState: examConfig.examState,
    totalSubmissions: subs.length,
    pendingGrade: subs.filter((s) => s.graded === 0).length,
    graded: subs.filter((s) => s.graded === 1).length,
  });
});

// POST /api/evaluation/end-exam — admin closes the exam window
evaluationRouter.post("/end-exam", requireAuth("admin"), (req: AuthedRequest, res) => {
  if (examConfig.examState !== "active") {
    return res.status(400).json({ error: `Exam is already '${examConfig.examState}'` });
  }
  setExamState("ended");
  appendBlock("exam_ended", { endedBy: req.user!.id, at: new Date().toISOString() });
  res.json({ examState: "ended", message: "Exam closed. Unlock answer keys to begin grading." });
});

// POST /api/evaluation/unlock-answers — admin unlocks answer vault and grades all submissions
evaluationRouter.post("/unlock-answers", requireAuth("admin"), (req: AuthedRequest, res) => {
  if (examConfig.examState !== "ended") {
    return res.status(400).json({ error: "End the exam first before unlocking answer keys" });
  }

  const subs = getAllSubmissions().filter((s) => s.graded === 0);
  const mcqQs = questions.filter((q) => q.options && q.options.length > 0 && q.status === "approved");

  let gradedCount = 0;
  const results: { rollHash: string; score: number; total: number; pct: number }[] = [];

  for (const sub of subs) {
    let score = 0;
    let total = 0;
    for (const q of mcqQs) {
      total += q.marks;
      const key = getAnswerKey(q.id);
      if (key === null) continue;
      const given = sub.answers[q.id];
      if (typeof given === "number" && given === key) score += q.marks;
    }
    gradeSubmission(sub.rollNumber, score, total);
    // Update script to evaluated
    const code = `SC-${sha256(`submit|${sub.rollNumber}|${mcqQs[0]?.id ?? "p"}`).slice(0, 8).toUpperCase()}`;
    const script = scripts.find((s) => s.code === code);
    if (script && script.status === "pending") {
      updateScript(code, { status: "evaluated", marks: score, evaluatedBy: "parakh-auto" });
    }
    results.push({ rollHash: sha256(sub.rollNumber), score, total, pct: total > 0 ? Math.round((score / total) * 100) : 0 });
    gradedCount++;
  }

  setExamState("evaluated");
  appendBlock("answer_keys_unlocked", {
    unlockedBy: req.user!.id,
    at: new Date().toISOString(),
    submissionsGraded: gradedCount,
  });

  res.json({ gradedCount, examState: "evaluated", results });
});

// GET /api/evaluation/results — released only after admin evaluates
evaluationRouter.get("/results", requireAuth("teacher", "admin"), (_req, res) => {
  if (examConfig.examState !== "evaluated") {
    return res.status(403).json({ error: "Results locked — admin must unlock answer keys first" });
  }
  const subs = getAllSubmissions();
  res.json({
    results: subs.map((s) => ({
      rollHash: sha256(s.rollNumber),
      score: s.score,
      total: s.total,
      percentage: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0,
      submittedAt: s.submittedAt,
    })),
    examState: examConfig.examState,
  });
});
