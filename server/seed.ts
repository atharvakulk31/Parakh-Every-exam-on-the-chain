import {
  centers, papers, assignments, examConfig, flags, scripts,
  addFlag, addScript, addPaper, setAssignment, setExamStartAt,
  updateFlag, updateLiveStats, updateCenter, type Flag,
} from "./store.js";
import { appendBlock, sha256 } from "./crypto.js";

export function seedDemoState(): void {
  // Idempotent — skip if already seeded (survives server restarts)
  if (papers.some((p) => p.paperId === "P-SEED2026")) {
    console.log("Demo state already seeded — skipping");
    return;
  }

  const paperId = "P-SEED2026";
  const subject = "Physics";
  const variantIds = ["A", "B"];

  addPaper({ paperId, subject, variantIds });
  updateLiveStats({ papersAssembled: 1, lastFairness: 97 });

  appendBlock("paper_assembled", {
    paperId,
    subject,
    variantCount: 2,
    paperHash: sha256(`${paperId}|seed`),
    assembledBy: "u-tea-1",
    source: "claude",
  });

  const startAt = Date.now() - 30 * 60_000;
  setExamStartAt(startAt);
  appendBlock("exam_scheduled", {
    startAt: new Date(examConfig.startAt!).toISOString(),
    scheduledBy: "u-adm-1",
  });

  const t = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

  centers.forEach((c, i) => {
    const variant = variantIds[i % variantIds.length];
    updateCenter(c.id, {
      variant,
      paperId,
      status: "unlocked",
      custody: [
        { timestamp: t(55), event: `Sealed package created (paper ${paperId}, variant ${variant})` },
        { timestamp: t(55), event: "Time-locked AES — decrypts only at T-zero" },
        { timestamp: t(30), event: "T-zero reached — package decrypted in exam hall" },
      ],
    });

    appendBlock("paper_distributed", { centerId: c.id, paperId, variant, distributedBy: "u-adm-1" });

    for (let n = 1; n <= 3; n++) {
      const rollNumber = `${c.id}-00${n}`;
      const block = appendBlock("candidate_assigned", {
        rollNumber,
        centerId: c.id,
        assignmentHash: sha256(`${rollNumber}|${paperId}`),
      });
      setAssignment(rollNumber, { rollNumber, centerId: c.id, paperId, variant, blockHash: block.hash });
    }
    appendBlock("center_unlocked", { centerId: c.id, paperId, unlockedBy: "u-adm-1" });
  });

  // Pre-decided flags so history isn't empty
  const decided: { type: Flag["type"]; candidate: string; centerId: string; decision: "confirmed" | "dismissed" }[] = [
    { type: "focus_loss", candidate: "MH02-001", centerId: "MH02", decision: "dismissed" },
    { type: "no_face", candidate: "KA01-003", centerId: "KA01", decision: "confirmed" },
  ];
  for (const d of decided) {
    const f = addFlag({ type: d.type, candidate: d.candidate, centerId: d.centerId, severity: d.type === "no_face" ? "high" : "low" });
    updateFlag(f.id, { status: d.decision, decidedBy: "u-tea-1" });
    appendBlock("flag_decision", {
      flagId: f.id,
      candidate: f.candidate,
      type: f.type,
      decision: d.decision,
      decidedBy: "u-tea-1",
    });
  }

  // Open flags so the proctoring queue isn't empty
  addFlag({ centerId: "MH01", candidate: "MH01-002", type: "tab_switch", severity: "medium" });
  addFlag({ centerId: "DL01", candidate: "DL01-001", type: "multiple_faces", severity: "high" });

  // Anonymised scripts
  let i = 0;
  for (const a of assignments.values()) {
    const code = `SC-${sha256(`script|${a.rollNumber}|${paperId}`).slice(0, 8).toUpperCase()}`;
    const evaluated = i < 4;
    addScript({
      code,
      subject,
      paperId,
      variant: a.variant,
      status: evaluated ? "evaluated" : "pending",
      marks: evaluated ? 9 + (i % 4) : null,
      evaluatedBy: evaluated ? "u-tea-1" : null,
    });
    if (evaluated) {
      appendBlock("script_evaluated", { scriptCode: code, marks: 9 + (i % 4), evaluatedBy: "u-tea-1" });
    }
    i++;
  }

  console.log(`Seeded demo state: ${papers.length} paper, ${assignments.size} assignments, ${scripts.length} scripts, ${flags.length} flags, chain ready`);
}
