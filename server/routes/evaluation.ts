import { Router } from "express";
import { scripts, updateScript } from "../store.js";
import { appendBlock } from "../crypto.js";
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
