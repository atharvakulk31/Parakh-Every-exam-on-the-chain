import { Router } from "express";
import { questions, addQuestion, approveQuestion } from "../store.js";
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
  const { subject, text, marks, difficulty, topic, language } = req.body ?? {};
  if (!subject || !text || typeof marks !== "number" || !["easy", "medium", "hard"].includes(difficulty)) {
    return res.status(400).json({ error: "subject, text, marks (number), difficulty (easy|medium|hard) required" });
  }
  const q = addQuestion({ subject, text, marks, difficulty, topic, language, createdBy: req.user!.id });
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
