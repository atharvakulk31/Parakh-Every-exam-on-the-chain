import { Router } from "express";
import { verifyChain, getChain, sha256, tamperDemo, restoreDemo } from "../crypto.js";
import { assignments } from "../store.js";
import { requireAuth } from "../auth.js";

export const verifyRouter = Router();

// Public integrity check — anyone (incl. students) can verify the chain
verifyRouter.get("/", (_req, res) => {
  const result = verifyChain();
  const chain = getChain();
  res.json({
    ...result,
    blocks: chain.map((b) => ({
      index: b.index,
      timestamp: b.timestamp,
      event: b.event,
      hash: b.hash,
      prevHash: b.prevHash,
    })),
  });
});

// Verify a record: roll number alone, raw hash, or rollNumber+paperId
verifyRouter.post("/", (req, res) => {
  const { hash, rollNumber, paperId } = req.body ?? {};
  const chain = getChain();
  const integrity = verifyChain();

  if (rollNumber && !paperId) {
    const assignment = assignments.get(String(rollNumber).trim().toUpperCase()) ?? null;
    if (!assignment) {
      return res.json({ chainValid: integrity.valid, brokenAt: integrity.brokenAt, found: false, assignment: null, block: null });
    }
    const expected = sha256(`${assignment.rollNumber}|${assignment.paperId}`);
    const block = chain.find((b) => b.data.assignmentHash === expected && b.data.rollNumber === assignment.rollNumber) ?? null;
    return res.json({
      chainValid: integrity.valid,
      brokenAt: integrity.brokenAt,
      found: !!block,
      assignment: {
        rollNumber: assignment.rollNumber,
        centerId: assignment.centerId,
        paperId: assignment.paperId,
        variant: assignment.variant,
      },
      block: block ? { index: block.index, timestamp: block.timestamp, hash: block.hash } : null,
    });
  }

  let match = null;
  if (hash) {
    match = chain.find((b) => b.hash === hash) ?? null;
  } else if (rollNumber && paperId) {
    const target = sha256(`${rollNumber}|${paperId}`);
    match = chain.find((b) => b.data.assignmentHash === target) ?? null;
  } else {
    return res.status(400).json({ error: "Provide rollNumber, hash, or rollNumber + paperId" });
  }

  res.json({
    chainValid: integrity.valid,
    brokenAt: integrity.brokenAt,
    found: !!match,
    block: match
      ? { index: match.index, timestamp: match.timestamp, event: match.event, hash: match.hash }
      : null,
  });
});

// Demo-only: mutate a block to prove tamper detection, then restore
verifyRouter.post("/tamper", requireAuth("admin"), (_req, res) => {
  res.json(tamperDemo());
});
verifyRouter.post("/restore", requireAuth("admin"), (_req, res) => {
  res.json(restoreDemo());
});
