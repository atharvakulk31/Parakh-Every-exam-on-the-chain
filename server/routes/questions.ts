import { Router } from "express";
import { questions, addQuestion, approveQuestion, deleteQuestion, type Question } from "../store.js";
import { decrypt, appendBlock, sha256 } from "../crypto.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const questionsRouter = Router();

questionsRouter.get("/", requireAuth("teacher", "admin"), (req, res) => {
  const subject = typeof req.query.subject === "string" ? req.query.subject : null;
  const list = questions
    .filter((q) => !subject || q.subject.toLowerCase() === subject.toLowerCase())
    .map((q) => {
      let text: string;
      let integrity = true;
      try {
        text = decrypt(q.encryptedText);
      } catch {
        text = "[DECRYPTION FAILED — possible tampering]";
        integrity = false;
      }
      return {
        id: q.id,
        subject: q.subject,
        topic: q.topic,
        language: q.language,
        status: q.status,
        text,
        marks: q.marks,
        difficulty: q.difficulty,
        createdBy: q.createdBy,
        createdAt: q.createdAt,
        integrity,
      };
    });
  res.json({ count: list.length, questions: list });
});

questionsRouter.post("/", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const { subject, text, marks, difficulty, topic, language, options, correctAnswer, autoApprove } = req.body ?? {};
  if (!subject || !text || typeof marks !== "number" || !["easy", "medium", "hard"].includes(difficulty)) {
    return res.status(400).json({ error: "subject, text, marks (number), difficulty (easy|medium|hard) required" });
  }
  // Validate MCQ fields if provided
  if (options !== undefined) {
    if (!Array.isArray(options) || options.length !== 4 || options.some((o: unknown) => typeof o !== "string" || !o.trim())) {
      return res.status(400).json({ error: "MCQ requires exactly 4 non-empty options" });
    }
    if (typeof correctAnswer !== "number" || correctAnswer < 0 || correctAnswer > 3) {
      return res.status(400).json({ error: "correctAnswer must be 0–3" });
    }
  }
  const q = addQuestion({ subject, text, marks, difficulty, topic, language, createdBy: req.user!.id, options, correctAnswer });
  if (autoApprove) approveQuestion(q.id);
  appendBlock("question_submitted", {
    questionId: q.id,
    subject: q.subject,
    topic: q.topic,
    textHash: sha256(text),
    submittedBy: req.user!.id,
  });
  res.status(201).json({
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    language: q.language,
    status: q.status,
    marks: q.marks,
    difficulty: q.difficulty,
    createdAt: q.createdAt,
    encrypted: true,
  });
});

// POST /api/questions/bulk — bulk import MCQ questions (CSV parsed client-side, sent as JSON array)
questionsRouter.post("/bulk", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const { questions: rows, autoApprove } = req.body ?? {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "questions array required" });
  }
  const added: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Partial<Question & { text: string; autoApprove?: boolean }>;
    const { subject, text, marks, difficulty, topic, options, correctAnswer } = r;
    if (!subject || !text || typeof marks !== "number" || !["easy", "medium", "hard"].includes(difficulty ?? "")) {
      errors.push(`Row ${i + 1}: missing subject/text/marks/difficulty`);
      continue;
    }
    if (options && (options.length !== 4 || options.some((o) => typeof o !== "string" || !o.trim()))) {
      errors.push(`Row ${i + 1}: MCQ requires exactly 4 non-empty options`);
      continue;
    }
    const q = addQuestion({
      subject, text, marks: Number(marks), difficulty: difficulty as Question["difficulty"],
      topic: topic || subject, language: "English",
      createdBy: req.user!.id,
      options: options ?? undefined,
      correctAnswer: correctAnswer != null ? correctAnswer : undefined,
    });
    if (autoApprove) approveQuestion(q.id);
    added.push(q.id);
  }
  res.json({ added: added.length, ids: added, errors });
});

// DELETE /api/questions/:id — teachers can delete only their own PENDING questions
questionsRouter.delete("/:id", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const q = questions.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: "Question not found" });
  if (q.createdBy !== req.user!.id && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Cannot delete another teacher's question" });
  }
  if (q.status === "approved" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Approved questions can only be deleted by admin" });
  }
  deleteQuestion(q.id);
  appendBlock("question_deleted", { questionId: q.id, deletedBy: req.user!.id });
  res.json({ deleted: q.id });
});

questionsRouter.patch("/:id/approve", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const q = questions.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: "Question not found" });
  if (q.status === "approved") return res.status(409).json({ error: "Already approved" });
  if (q.createdBy === req.user!.id) {
    return res.status(403).json({ error: "Authors cannot approve their own questions (peer review required)" });
  }
  approveQuestion(q.id);
  appendBlock("question_approved", { questionId: q.id, approvedBy: req.user!.id });
  res.json({ id: q.id, status: "approved" });
});
