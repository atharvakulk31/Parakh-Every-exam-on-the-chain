import { Router } from "express";
import { flags, addFlag, updateFlag, type Flag } from "../store.js";
import { appendBlock } from "../crypto.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const proctoringRouter = Router();

const SEVERITY: Record<Flag["type"], Flag["severity"]> = {
  tab_switch: "medium",
  fullscreen_exit: "medium",
  focus_loss: "low",
  multiple_faces: "high",
  no_face: "high",
};

proctoringRouter.get("/flags", requireAuth("teacher", "admin"), (_req, res) => {
  res.json({ flags, openCount: flags.filter((f) => f.status === "open").length });
});

proctoringRouter.post("/flags", requireAuth("teacher", "admin"), (req, res) => {
  const { type, centerId = "MH01", candidate = "MH01-001" } = req.body ?? {};
  if (!(type in SEVERITY)) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(SEVERITY).join(", ")}` });
  }
  const flag = addFlag({ type, centerId, candidate, severity: SEVERITY[type as Flag["type"]] });
  res.status(201).json(flag);
});

proctoringRouter.patch("/flags/:id", requireAuth("teacher", "admin"), (req: AuthedRequest, res) => {
  const { action } = req.body ?? {};
  if (action !== "confirm" && action !== "dismiss") {
    return res.status(400).json({ error: "action must be confirm or dismiss" });
  }
  const flag = flags.find((f) => f.id === Number(req.params.id));
  if (!flag) return res.status(404).json({ error: "Flag not found" });
  if (flag.status !== "open") return res.status(409).json({ error: "Flag already decided" });

  const status = action === "confirm" ? "confirmed" : "dismissed";
  updateFlag(flag.id, { status, decidedBy: req.user!.id });
  appendBlock("flag_decision", {
    flagId: flag.id,
    candidate: flag.candidate,
    type: flag.type,
    decision: status,
    decidedBy: req.user!.id,
  });
  res.json(flag);
});
