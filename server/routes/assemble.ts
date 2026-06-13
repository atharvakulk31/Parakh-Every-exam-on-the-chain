import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { questions, liveStats, addPaper, updateLiveStats } from "../store.js";
import { decrypt, appendBlock, sha256 } from "../crypto.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const assembleRouter = Router();

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

interface AssembledQuestion {
  text_en: string;
  text_hi: string;
  text_mr: string;
  marks: number;
  difficulty: string;
}
interface AssembleResult {
  variants: { id: string; questions: AssembledQuestion[] }[];
  fairness: { score: number; balance: string; notes: string };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text_en: { type: "string" },
                text_hi: { type: "string" },
                text_mr: { type: "string" },
                marks: { type: "integer" },
                difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
              },
              required: ["text_en", "text_hi", "text_mr", "marks", "difficulty"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "questions"],
        additionalProperties: false,
      },
    },
    fairness: {
      type: "object",
      properties: {
        score: { type: "number" },
        balance: { type: "string" },
        notes: { type: "string" },
      },
      required: ["score", "balance", "notes"],
      additionalProperties: false,
    },
  },
  required: ["variants", "fairness"],
  additionalProperties: false,
} as const;

async function assembleWithClaude(subject: string, bank: { text: string; marks: number; difficulty: string }[], variantCount: number): Promise<AssembleResult> {
  const response = await client!.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system:
      "You are Parakh's paper-assembly engine for Indian board examinations. " +
      "Given a question bank, produce isomorphic exam paper variants: same concepts and difficulty, but reworded and with changed numbers so leaked variants are useless. " +
      "Translate every question into Hindi (text_hi) and Marathi (text_mr) faithfully. " +
      "Score fairness 0-100 based on difficulty balance across variants.",
    messages: [
      {
        role: "user",
        content:
          `Subject: ${subject}\nVariants needed: ${variantCount}\n\nQuestion bank:\n` +
          bank.map((q, i) => `${i + 1}. [${q.difficulty}, ${q.marks} marks] ${q.text}`).join("\n"),
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text block in Claude response");
  return JSON.parse(text.text) as AssembleResult;
}

function fallbackAssemble(subject: string, bank: { text: string; marks: number; difficulty: string }[], variantCount: number): AssembleResult {
  const variants = Array.from({ length: variantCount }, (_, v) => ({
    id: String.fromCharCode(65 + v),
    questions: bank.map((q) => ({
      text_en: `[Variant ${String.fromCharCode(65 + v)}] ${q.text}`,
      text_hi: `[संस्करण ${String.fromCharCode(65 + v)}] ${q.text} (अनुवाद ऑफ़लाइन मोड में अनुपलब्ध)`,
      text_mr: `[आवृत्ती ${String.fromCharCode(65 + v)}] ${q.text} (भाषांतर ऑफलाइन मोडमध्ये अनुपलब्ध)`,
      marks: q.marks,
      difficulty: q.difficulty,
    })),
  }));
  return {
    variants,
    fairness: {
      score: 100,
      balance: "identical",
      notes: `Offline fallback: ${variantCount} identical variants from the ${subject} bank. AI variant generation unavailable.`,
    },
  };
}

assembleRouter.post("/", requireAuth("teacher", "admin"), async (req: AuthedRequest, res) => {
  const { subject = "Physics", variantCount = 2, questionCount = 3 } = req.body ?? {};

  const bank = questions
    .filter((q) => q.status === "approved" && q.subject.toLowerCase() === String(subject).toLowerCase())
    .slice(0, Math.min(Number(questionCount) || 3, 10))
    .map((q) => {
      try {
        return { text: decrypt(q.encryptedText), marks: q.marks, difficulty: q.difficulty };
      } catch {
        return null;
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (bank.length === 0) {
    return res.status(400).json({ error: `No questions in bank for subject "${subject}"` });
  }

  const count = Math.min(Math.max(Number(variantCount) || 2, 1), 4);
  let result: AssembleResult;
  let source: "claude" | "fallback" = "claude";

  if (client) {
    try {
      result = await assembleWithClaude(subject, bank, count);
    } catch (err) {
      console.error("Claude assemble failed, using fallback:", err instanceof Error ? err.message : err);
      result = fallbackAssemble(subject, bank, count);
      source = "fallback";
    }
  } else {
    result = fallbackAssemble(subject, bank, count);
    source = "fallback";
  }

  updateLiveStats({
    lastFairness: result.fairness.score,
    papersAssembled: liveStats.papersAssembled + 1,
  });

  const paperId = `P-${Date.now().toString(36).toUpperCase()}`;
  const paperHash = sha256(JSON.stringify(result.variants));
  addPaper({ paperId, subject, variantIds: result.variants.map((v) => v.id) });
  appendBlock("paper_assembled", {
    paperId,
    subject,
    variantCount: result.variants.length,
    paperHash,
    assembledBy: req.user!.id,
    source,
  });

  res.json({ paperId, subject, source, paperHash, ...result });
});
