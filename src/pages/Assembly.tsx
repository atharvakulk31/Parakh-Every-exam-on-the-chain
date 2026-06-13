import { useEffect, useRef, useState } from "react";
import { Sparkles, Scale, Languages, Hash, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

interface AssembledQuestion {
  text_en: string;
  text_hi: string;
  text_mr: string;
  marks: number;
  difficulty: string;
}
interface AssembleResponse {
  paperId: string;
  subject: string;
  source: "claude" | "fallback";
  paperHash: string;
  variants: { id: string; questions: AssembledQuestion[] }[];
  fairness: { score: number; balance: string; notes: string };
}

type Lang = "en" | "hi" | "mr";
const LANGS: { key: Lang; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "hi", label: "हिं" },
  { key: "mr", label: "मरा" },
];

const LOG_STEPS = [
  "Authenticating assembler identity…",
  "Loading approved questions from encrypted bank…",
  "Decrypting in memory (AES-256-GCM)…",
  "Calling Claude — generating isomorphic variants…",
  "Rewording stems, changing numerical values…",
  "Translating to Hindi and Marathi…",
  "Scoring fairness across variants…",
  "Hashing paper → appending to chain…",
];

function questionText(q: AssembledQuestion, lang: Lang): string {
  return lang === "en" ? q.text_en : lang === "hi" ? q.text_hi : q.text_mr;
}

const LANG_NAME: Record<Lang, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

function LangToggle({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <span role="group" aria-label="Question language" className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
      {LANGS.map((l) => (
        <button key={l.key} onClick={() => onChange(l.key)}
          aria-pressed={value === l.key}
          aria-label={`Show in ${LANG_NAME[l.key]}`}
          className={`px-2 py-0.5 ${value === l.key ? "bg-royal-500 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
          {l.label}
        </button>
      ))}
    </span>
  );
}

export function Assembly() {
  const [subject, setSubject] = useState("Physics");
  const [variantCount, setVariantCount] = useState(2);
  const [questionCount, setQuestionCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembleResponse | null>(null);
  const [log, setLog] = useState<{ t: string; msg: string; done?: boolean }[]>([]);
  // language per question: key `${variantId}-${index}`
  const [langs, setLangs] = useState<Record<string, Lang>>({});
  const logTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);
  useEffect(() => () => { if (logTimer.current) clearInterval(logTimer.current); }, []);

  async function assemble() {
    setBusy(true);
    setError(null);
    setResult(null);
    setLangs({});
    setLog([]);

    // Streaming-feel log: steps tick while the real API call runs
    let step = 0;
    const pushStep = () => {
      if (step < LOG_STEPS.length - 1) {
        setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg: LOG_STEPS[step] }]);
        step += 1;
      }
    };
    pushStep();
    logTimer.current = setInterval(pushStep, 1800);

    try {
      const r = await api<AssembleResponse>("/api/assemble", {
        method: "POST",
        body: JSON.stringify({ subject, variantCount, questionCount }),
      });
      if (logTimer.current) clearInterval(logTimer.current);
      setLog((l) => [
        ...l,
        { t: new Date().toLocaleTimeString(), msg: LOG_STEPS[LOG_STEPS.length - 1] },
        {
          t: new Date().toLocaleTimeString(),
          msg: `✓ ${r.variants.length} variants ready (${r.source === "claude" ? "Claude live" : "offline fallback"}) — fairness ${r.fairness.score}/100`,
          done: true,
        },
      ]);
      setResult(r);
    } catch (err) {
      if (logTimer.current) clearInterval(logTimer.current);
      setError(err instanceof Error ? err.message : "Assembly failed");
      setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg: "✗ Assembly failed — see error above", done: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 2 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Paper Assembly Engine</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Claude assembles isomorphic variants — same concepts and difficulty, different wording and
        numbers — so a leaked variant is worthless. Every paper lands on the hash chain.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Controls + log */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
              <Sparkles size={16} className="text-royal-500" /> Assemble paper
            </h2>
            <label className="block text-xs font-medium text-slate-600">
              Subject
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                <option>Physics</option><option>Mathematics</option><option>Chemistry</option><option>Biology</option>
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-600">
                Variants
                <input type="number" min={1} max={4} value={variantCount}
                  onChange={(e) => setVariantCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Questions
                <input type="number" min={1} max={10} value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
              </label>
            </div>
            <button onClick={assemble} disabled={busy}
              className="mt-4 w-full rounded-md bg-royal-500 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50">
              {busy ? "Assembling…" : "Generate variants"}
            </button>
          </div>

          {/* Live assembly log */}
          <div className="rounded-lg border border-navy-700 bg-navy-950 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Assembly log</h2>
            <div role="log" aria-live="polite" aria-label="Assembly progress log" className="h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {log.length === 0 && <div className="text-slate-600">Awaiting assembly…</div>}
              {log.map((e, i) => (
                <div key={i} className={e.done ? "text-verified-500" : "text-slate-300"}>
                  <span className="text-slate-500">[{e.t}]</span> {e.msg}
                </div>
              ))}
              {busy && <div className="animate-pulse text-royal-400">▋</div>}
              <div ref={logEnd} />
            </div>
          </div>

          {/* Fairness + coverage */}
          {result && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Scale size={16} className="text-verified-500" /> Fairness report
              </h2>
              <div className="flex items-end gap-2">
                <span className={`text-4xl font-bold ${result.fairness.score >= 80 ? "text-verified-600" : result.fairness.score >= 60 ? "text-pending-500" : "text-alert-600"}`}>
                  {result.fairness.score}
                </span>
                <span className="pb-1 text-sm text-slate-500">/100 · {result.fairness.balance}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{result.fairness.notes}</p>
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <div className="flex items-center gap-2"><Hash size={13} className="shrink-0 text-royal-500" />
                  <span className="truncate font-mono" title={result.paperHash}>{result.paperHash.slice(0, 24)}…</span>
                </div>
                <div className="mt-1 flex items-center gap-2"><ShieldCheck size={13} className="text-verified-500" />
                  Paper {result.paperId} sealed on hash chain
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Variant cards side by side */}
        <div className="xl:col-span-2">
          {!result ? (
            <div className="flex h-full min-h-64 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500">
              Variants appear here — side by side, zero overlap.
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-4 ${result.variants.length > 1 ? "lg:grid-cols-2" : ""}`}>
              {result.variants.map((v) => (
                <div key={v.id} className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between rounded-t-lg bg-navy-900 px-4 py-3">
                    <span className="font-semibold text-white">Variant {v.id}</span>
                    <span className="flex items-center gap-1 rounded-full bg-navy-800 px-2 py-0.5 text-[11px] text-slate-300">
                      <Languages size={12} /> EN · HI · MR
                    </span>
                  </div>
                  <ol className="divide-y divide-slate-100">
                    {v.questions.map((q, i) => {
                      const key = `${v.id}-${i}`;
                      const lang = langs[key] ?? "en";
                      return (
                        <li key={key} className="p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-navy-900">Q{i + 1}</span>
                            <span className="capitalize">{q.difficulty}</span>
                            <span>· {q.marks} marks</span>
                            <span className="ml-auto">
                              <LangToggle value={lang} onChange={(l) => setLangs((s) => ({ ...s, [key]: l }))} />
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-slate-700">{questionText(q, lang)}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
          {result && (
            <p className="mt-3 text-xs text-slate-500">
              Zero overlap: variants share concepts, never wording or numbers — compare Q1 across cards.
              Source: {result.source === "claude" ? "Claude (live)" : "offline fallback"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
