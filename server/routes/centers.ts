import { Router } from "express";
import { centers, papers, assignments, examConfig, updateCenter, setAssignment, setExamStartAt } from "../store.js";
import { appendBlock, sha256 } from "../crypto.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const centersRouter = Router();

centersRouter.get("/", requireAuth("admin"), (_req, res) => {
  res.json({
    centers,
    examStartAt: examConfig.startAt,
    serverNow: Date.now(),
    papersAvailable: papers.map((p) => p.paperId),
  });
});

centersRouter.post("/schedule", requireAuth("admin"), (req: AuthedRequest, res) => {
  const minutes = Math.min(Math.max(Number(req.body?.minutes) || 2, 0.5), 180);
  setExamStartAt(Date.now() + minutes * 60_000);
  appendBlock("exam_scheduled", { startAt: new Date(examConfig.startAt!).toISOString(), scheduledBy: req.user!.id });
  res.json({ examStartAt: examConfig.startAt, serverNow: Date.now() });
});

centersRouter.post("/distribute", requireAuth("admin"), (req: AuthedRequest, res) => {
  const paper = papers[papers.length - 1];
  if (!paper) return res.status(400).json({ error: "No assembled paper yet — run Paper Assembly first" });

  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const variant = paper.variantIds[i % paper.variantIds.length];
    updateCenter(c.id, {
      variant,
      paperId: paper.paperId,
      status: "sealed",
      custody: [
        { timestamp: new Date().toISOString(), event: `Sealed package created (paper ${paper.paperId}, variant ${variant})` },
        { timestamp: new Date().toISOString(), event: "Time-locked AES — decrypts only at T-zero" },
      ],
    });
    appendBlock("paper_distributed", { centerId: c.id, paperId: paper.paperId, variant, distributedBy: req.user!.id });

    for (let n = 1; n <= 3; n++) {
      const rollNumber = `${c.id}-00${n}`;
      const block = appendBlock("candidate_assigned", {
        rollNumber,
        centerId: c.id,
        assignmentHash: sha256(`${rollNumber}|${paper.paperId}`),
      });
      setAssignment(rollNumber, { rollNumber, centerId: c.id, paperId: paper.paperId, variant, blockHash: block.hash });
    }
  }
  res.json({ distributed: centers.length, paperId: paper.paperId, candidates: assignments.size });
});

centersRouter.post("/unlock", requireAuth("admin"), (req: AuthedRequest, res) => {
  if (!examConfig.startAt || Date.now() < examConfig.startAt) {
    return res.status(403).json({ error: "T-zero not reached — package stays sealed" });
  }
  let unlocked = 0;
  for (const c of centers) {
    if (c.status === "sealed") {
      const newCustody = [
        ...c.custody,
        { timestamp: new Date().toISOString(), event: "T-zero reached — package decrypted in exam hall" },
      ];
      updateCenter(c.id, { status: "unlocked", custody: newCustody });
      appendBlock("center_unlocked", { centerId: c.id, paperId: c.paperId, unlockedBy: req.user!.id });
      unlocked++;
    }
  }
  res.json({ unlocked });
});
