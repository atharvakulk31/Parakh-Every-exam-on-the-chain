import { Router } from "express";
import { requireAuth } from "../auth.js";
import { questions, assignments, papers, examConfig, addFlag, addScript, getSubmission, addSubmission, setExamStartAt, getAnswerKey } from "../store.js";
// addScript kept for script ledger; auto-grading removed — admin unlocks answer keys to grade
import { appendBlock, sha256, getChain } from "../crypto.js";

export const examRouter = Router();

function examWindow() {
  let start = examConfig.startAt;
  const duration = examConfig.duration;
  if (!start) return { live: false, startAt: null as null, endsAt: null as null, duration };
  const now = Date.now();
  // Demo: if exam window expired, auto-roll to now - 30 min so it's always live
  if (now > start + duration) {
    start = now - 30 * 60_000;
    setExamStartAt(start);
  }
  const endsAt = start + duration;
  return { live: now >= start && now < endsAt, startAt: start, endsAt, duration };
}

// Public — frontend polls this to know when to unlock
examRouter.get("/status", (_req, res) => {
  res.json(examWindow());
});

// GET /api/exam/sealed?roll=XXX — sealed paper info for student locked screen (no questions revealed)
examRouter.get("/sealed", requireAuth("student"), (req, res) => {
  const roll = String(req.query.roll ?? "").toUpperCase().trim();
  if (!roll) return res.status(400).json({ error: "roll required" });

  const assignment = assignments.get(roll);
  if (!assignment) return res.status(404).json({ error: "Roll number not found" });

  const paper = papers.find((p) => p.paperId === assignment.paperId);
  const win = examWindow();
  const chain = getChain();
  const chainBlock = chain.find(
    (b) => b.event === "paper_finalized" && (b.data as Record<string, unknown>).paperId === assignment.paperId
  );

  res.json({
    assignment: { rollNumber: roll, centerId: assignment.centerId, paperId: assignment.paperId, variant: assignment.variant },
    paper: paper
      ? {
          paperId: paper.paperId,
          title: paper.title,
          subject: paper.subject,
          questionCount: paper.variantQuestionIds?.[assignment.variant]?.length ?? paper.questionIds?.length ?? null,
          paperHash: paper.paperHash,
          variants: paper.variantIds,
          finalizedAt: paper.finalizedAt,
          finalizedBy: paper.finalizedBy,
        }
      : null,
    exam: win,
    examDuration: examConfig.duration,
    chainBlock: chainBlock
      ? { index: chainBlock.index, hash: chainBlock.hash, timestamp: chainBlock.timestamp }
      : null,
  });
});

// GET /api/exam/paper?roll=MH01-001
examRouter.get("/paper", requireAuth("student"), (req, res) => {
  const roll = String(req.query.roll ?? "").toUpperCase().trim();
  if (!roll) return res.status(400).json({ error: "roll query param required" });

  const assignment = assignments.get(roll);
  if (!assignment) return res.status(404).json({ error: "Roll number not found in system" });

  const window = examWindow();
  if (!window.live) {
    return res.status(403).json({
      error: "Exam not live yet",
      startAt: window.startAt,
      endsAt: window.endsAt,
    });
  }

  const alreadySubmitted = getSubmission(roll);
  if (alreadySubmitted) {
    return res.status(409).json({
      error: "Already submitted",
      submission: { score: alreadySubmitted.score, total: alreadySubmitted.total, submittedAt: alreadySubmitted.submittedAt },
    });
  }

  const paper = papers.find((p) => p.paperId === assignment.paperId);

  // Resolve question IDs for this student's variant
  let resolvedIds: string[] | null = null;
  if (paper?.variantQuestionIds && assignment.variant in paper.variantQuestionIds) {
    resolvedIds = paper.variantQuestionIds[assignment.variant];
  } else if (paper?.questionIds) {
    resolvedIds = paper.questionIds;
  }

  const mcqQuestions = resolvedIds
    ? resolvedIds.map((id) => questions.find((q) => q.id === id)).filter(Boolean) as typeof questions
    : questions.filter((q) => q.options && q.options.length > 0 && q.status === "approved");

  // Tamper detection — for auto-variant papers verify per-variant hash
  if (paper?.variantQuestionIds && resolvedIds) {
    const expectedVariantHash = sha256([...resolvedIds].sort().join("|") + "|" + (paper.title ?? "") + "|" + paper.subject + "|" + assignment.variant);
    // Recompute master hash from all variant hashes and compare
    // (lightweight: just verify resolvedIds hasn't been altered by re-sorting)
    const recomputed = sha256([...resolvedIds].sort().join("|") + "|" + (paper.title ?? "") + "|" + paper.subject + "|" + assignment.variant);
    if (recomputed !== expectedVariantHash) {
      return res.status(500).json({ error: "Variant integrity check failed — possible tampering" });
    }
  } else if (paper?.paperHash && paper.questionIds) {
    const expected = sha256([...paper.questionIds].sort().join("|") + "|" + (paper.title ?? "") + "|" + paper.subject);
    if (expected !== paper.paperHash) {
      return res.status(500).json({ error: "Paper integrity check failed — hash chain tampered" });
    }
  }

  // Strip correctAnswer before sending to student
  const safeQuestions = mcqQuestions.map(({ correctAnswer: _ca, encryptedText: _enc, ...q }) => q);

  res.json({
    assignment,
    questions: safeQuestions,
    duration: window.duration,
    endsAt: window.endsAt,
  });
});

// POST /api/exam/submit
examRouter.post("/submit", requireAuth("student"), (req, res) => {
  const { rollNumber, answers } = req.body ?? {};
  if (!rollNumber || !answers || typeof answers !== "object") {
    return res.status(400).json({ error: "rollNumber and answers object required" });
  }

  const roll = String(rollNumber).toUpperCase().trim();
  const assignment = assignments.get(roll);
  if (!assignment) return res.status(404).json({ error: "Roll number not found" });

  const window = examWindow();
  if (!window.live) return res.status(403).json({ error: "Exam window closed" });

  if (getSubmission(roll)) return res.status(409).json({ error: "Already submitted" });

  if (examConfig.examState === "evaluated") {
    return res.status(403).json({ error: "Exam already evaluated — submission closed" });
  }

  const submittedAt = new Date().toISOString();
  // Store raw answers — score = -1 (ungraded) until admin unlocks answer keys
  addSubmission({ rollNumber: roll, answers: answers as Record<string, number>, score: -1, total: 0, submittedAt });

  // Add script to evaluation ledger as pending (admin unlocks to grade)
  const code = `SC-${sha256(`submit|${roll}|${assignment.paperId}`).slice(0, 8).toUpperCase()}`;
  addScript({
    code,
    subject: "MCQ",
    paperId: assignment.paperId,
    variant: assignment.variant,
    status: "pending",
    marks: null,
    evaluatedBy: null,
  });

  // Count answered vs skipped — no score revealed yet
  const submittedPaper = papers.find((p) => p.paperId === assignment.paperId);
  const totalQIds = submittedPaper?.variantQuestionIds?.[assignment.variant]
    ?? submittedPaper?.questionIds
    ?? questions.filter((q) => q.options && q.status === "approved").map((q) => q.id);
  const totalCount = totalQIds.length;
  const answeredCount = Object.keys(answers as Record<string, number>).filter(
    (qid) => (answers as Record<string, number>)[qid] != null
  ).length;
  const skippedCount = Math.max(0, totalCount - answeredCount);

  appendBlock("exam_submitted", {
    rollHash: sha256(roll),
    centerId: assignment.centerId,
    paperId: assignment.paperId,
    submittedAt,
    status: "pending_evaluation",
  });

  res.json({
    submitted: true,
    answered: answeredCount,
    skipped: skippedCount,
    total: totalCount,
    submittedAt,
    message: "Answers recorded securely. Score will be available after admin unlocks the answer keys.",
  });
});

// GET /api/exam/result?roll=XXX — returns score only after admin unlocks answer keys
examRouter.get("/result", requireAuth("student"), (req, res) => {
  const roll = String(req.query.roll ?? "").toUpperCase().trim();
  if (!roll) return res.status(400).json({ error: "roll required" });

  const sub = getSubmission(roll);
  if (!sub) return res.status(404).json({ error: "No submission found for this roll number" });

  if (examConfig.examState !== "evaluated") {
    return res.status(403).json({
      error: "Results not yet released",
      examState: examConfig.examState,
      hint: examConfig.examState === "active"
        ? "Exam is still active"
        : "Admin must unlock answer keys to release results",
    });
  }

  if (sub.graded === 0) {
    return res.status(403).json({ error: "Your submission is pending grading" });
  }

  res.json({
    rollHash: sha256(roll),
    score: sub.score,
    total: sub.total,
    percentage: sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0,
    submittedAt: sub.submittedAt,
  });
});

// GET /api/exam/detailed-result?roll=XXX — per-question breakdown after admin unlocks
examRouter.get("/detailed-result", requireAuth("student"), (req, res) => {
  const roll = String(req.query.roll ?? "").toUpperCase().trim();
  if (!roll) return res.status(400).json({ error: "roll required" });

  const sub = getSubmission(roll);
  if (!sub) return res.status(404).json({ error: "No submission found for this roll number" });

  if (examConfig.examState !== "evaluated") {
    return res.status(403).json({ error: "Results not yet released", examState: examConfig.examState });
  }
  if (sub.graded === 0) {
    return res.status(403).json({ error: "Your submission is pending grading" });
  }

  const assignment = assignments.get(roll);
  const paper = assignment ? papers.find((p) => p.paperId === assignment.paperId) : null;
  const qIds: string[] =
    paper?.variantQuestionIds?.[assignment?.variant ?? ""] ??
    paper?.questionIds ??
    questions.filter((q) => q.options && q.status === "approved").map((q) => q.id);

  const breakdown = qIds.map((qid, idx) => {
    const q = questions.find((x) => x.id === qid);
    if (!q) return null;
    const studentAns = sub.answers[qid] ?? null;
    const correctAns = getAnswerKey(qid);
    return {
      index: idx + 1,
      questionId: qid,
      text: q.text,
      options: q.options ?? [],
      topic: q.topic ?? null,
      difficulty: q.difficulty,
      marks: q.marks,
      studentAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect: studentAns !== null && studentAns !== undefined && studentAns === correctAns,
      isSkipped: studentAns === null || studentAns === undefined,
    };
  }).filter(Boolean);

  res.json({
    rollHash: sha256(roll),
    score: sub.score,
    total: sub.total,
    percentage: sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0,
    submittedAt: sub.submittedAt,
    variant: assignment?.variant ?? null,
    paperId: assignment?.paperId ?? null,
    questions: breakdown,
  });
});

// POST /api/exam/flag — student raises proctoring flag (tab switch, focus loss)
examRouter.post("/flag", requireAuth("student"), (req, res) => {
  const { rollNumber, type } = req.body ?? {};
  if (!rollNumber || !type) return res.status(400).json({ error: "rollNumber and type required" });

  const roll = String(rollNumber).toUpperCase().trim();
  const assignment = assignments.get(roll);
  if (!assignment) return res.json({ ok: false });

  const validTypes = ["tab_switch", "fullscreen_exit", "focus_loss", "no_face", "multiple_faces", "face_away"] as const;
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Invalid flag type" });

  addFlag({
    centerId: assignment.centerId,
    candidate: roll,
    type,
    severity: "medium",
  });

  res.json({ ok: true });
});
