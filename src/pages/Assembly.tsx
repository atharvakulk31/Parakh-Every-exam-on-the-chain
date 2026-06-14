import { useEffect, useRef, useState } from "react";
import { Sparkles, Scale, Languages, Hash, ShieldCheck, ClipboardCheck, CheckSquare, Square, Lock, Clock, Plus, Upload, X, CalendarClock, Shuffle, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";

// ─── AI Assembly ─────────────────────────────────────────────────────────────

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
    <span role="group" className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px]">
      {LANGS.map((l) => (
        <button key={l.key} onClick={() => onChange(l.key)}
          className={`px-2 py-0.5 ${value === l.key ? "bg-royal-500 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
          {l.label}
        </button>
      ))}
    </span>
  );
}

// ─── Manual Compose ───────────────────────────────────────────────────────────

interface BankQuestion {
  id: string;
  subject: string;
  topic: string;
  plainText: string | null;
  options: string[] | null;
  marks: number;
  difficulty: string;
  status: string;
}
interface FinalizeResponse {
  paperId: string;
  title: string;
  paperHash: string;
  questionCount: number;
  durationMinutes: number;
  startAt: number | null;
  chainBlock: { index: number; hash: string; timestamp: string };
  message: string;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

function defaultStartAt() {
  const d = new Date(Date.now() + 5 * 60_000);
  return d.toISOString().slice(0, 16);
}

function ManualCompose() {
  const [bankQ, setBankQ] = useState<BankQuestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Physics");
  const [duration, setDuration] = useState(60);
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);

  // Inline question add
  const [addMode, setAddMode] = useState<"none" | "manual" | "csv">("none");
  const [inlineQ, setInlineQ] = useState({ text: "", topic: "", difficulty: "medium", marks: 3, options: ["", "", "", ""], correctAnswer: 0 });
  const [csvText, setCsvText] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const loadBank = () =>
    api<{ questions: BankQuestion[] }>("/api/paper-compose/questions")
      .then((r) => setBankQ(r.questions))
      .catch(() => {});

  useEffect(() => { loadBank(); }, []);

  const subjects = ["All", ...Array.from(new Set(bankQ.map((q) => q.subject)))];
  const filtered = subjectFilter === "All" ? bankQ : bankQ.filter((q) => q.subject === subjectFilter);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Add single question inline — auto-approved so teacher can use it immediately
  async function addInlineQuestion() {
    setError(null);
    if (!inlineQ.text.trim()) { setError("Question text required"); return; }
    if (inlineQ.options.some((o) => !o.trim())) { setError("All 4 options required"); return; }
    setAddBusy(true);
    try {
      const r = await api<{ id: string }>("/api/questions", {
        method: "POST",
        body: JSON.stringify({
          subject, text: inlineQ.text, topic: inlineQ.topic || subject,
          marks: inlineQ.marks, difficulty: inlineQ.difficulty, language: "English",
          options: inlineQ.options, correctAnswer: inlineQ.correctAnswer,
          autoApprove: true,
        }),
      });
      await loadBank();
      setSelected((prev) => new Set([...prev, r.id]));
      setInlineQ({ text: "", topic: "", difficulty: "medium", marks: 3, options: ["", "", "", ""], correctAnswer: 0 });
      setAddMode("none");
    } catch (err: any) {
      setError(err?.message ?? "Failed to add question");
    } finally {
      setAddBusy(false);
    }
  }

  // CSV format: question,optA,optB,optC,optD,correctAnswer(0-3),marks,difficulty,topic
  async function uploadCSV() {
    setError(null);
    const lines = csvText.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    if (lines.length === 0) { setError("No rows in CSV"); return; }
    const parsed = lines.map((line, i) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 6) return null;
      const [text, optA, optB, optC, optD, ca, marksStr, diff, topic] = cols;
      const cai = parseInt(ca);
      return {
        subject, text, options: [optA, optB, optC, optD],
        correctAnswer: isNaN(cai) ? 0 : Math.min(3, Math.max(0, cai)),
        marks: parseInt(marksStr) || 3,
        difficulty: ["easy", "medium", "hard"].includes(diff) ? diff : "medium",
        topic: topic || subject,
        _row: i + 1,
      };
    }).filter(Boolean);
    if (parsed.length === 0) { setError("Could not parse any rows — check format"); return; }
    setAddBusy(true);
    try {
      const r = await api<{ added: number; ids: string[]; errors: string[] }>("/api/questions/bulk", {
        method: "POST",
        body: JSON.stringify({ questions: parsed, autoApprove: true }),
      });
      await loadBank();
      setSelected((prev) => new Set([...prev, ...r.ids]));
      setCsvText("");
      setAddMode("none");
      if (r.errors.length) setError(`Added ${r.added} questions. Errors: ${r.errors.join("; ")}`);
    } catch (err: any) {
      setError(err?.message ?? "CSV upload failed");
    } finally {
      setAddBusy(false);
    }
  }

  async function finalize() {
    setError(null);
    if (!title.trim()) { setError("Paper title required"); return; }
    if (selected.size < 1) { setError("Select at least 1 question"); return; }
    setBusy(true);
    try {
      const r = await api<FinalizeResponse>("/api/paper-compose/finalize", {
        method: "POST",
        body: JSON.stringify({
          title, subject, questionIds: Array.from(selected),
          durationMinutes: duration, startAt: new Date(startAt).toISOString(),
        }),
      });
      setResult(r);
    } catch (err: any) {
      setError(err?.message ?? "Finalization failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mt-6 max-w-2xl">
        <div className="rounded-xl border-2 border-verified-500 bg-verified-50 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="rounded-full bg-verified-100 p-3">
              <Lock size={22} className="text-verified-600" />
            </div>
            <div>
              <div className="font-bold text-verified-800 text-lg">Paper Sealed on Blockchain</div>
              <div className="text-xs text-verified-600">Block #{result.chainBlock.index} · {new Date(result.chainBlock.timestamp).toLocaleString()}</div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Paper ID</dt><dd className="font-mono font-semibold text-navy-900">{result.paperId}</dd></div>
            <div><dt className="text-xs text-slate-500">Title</dt><dd className="font-semibold text-navy-900">{result.title}</dd></div>
            <div><dt className="text-xs text-slate-500">Questions</dt><dd className="font-semibold text-navy-900">{result.questionCount}</dd></div>
            <div><dt className="text-xs text-slate-500">Duration</dt><dd className="font-semibold text-navy-900">{result.durationMinutes} min</dd></div>
            {result.startAt && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Exam Scheduled</dt>
                <dd className="font-semibold text-navy-900 flex items-center gap-1.5">
                  <CalendarClock size={14} className="text-royal-500" />
                  {new Date(result.startAt).toLocaleString()}
                </dd>
              </div>
            )}
            <div className="col-span-2 pt-2 border-t border-verified-200">
              <dt className="text-xs text-slate-500 mb-1">Paper Hash (SHA-256) — tamper-proof</dt>
              <dd className="font-mono text-xs break-all text-navy-900 bg-white rounded px-2 py-1.5 border border-verified-200">{result.paperHash}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-slate-500 mb-1">Chain Block Hash</dt>
              <dd className="font-mono text-xs break-all text-navy-900 bg-white rounded px-2 py-1.5 border border-verified-200">{result.chainBlock.hash}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500 border-t border-verified-200 pt-3">
            {result.message} Students will see this paper in their exam portal in locked state until the scheduled time.
          </p>
          <button onClick={() => { setResult(null); setSelected(new Set()); setTitle(""); setStartAt(defaultStartAt()); }}
            className="mt-3 w-full rounded-lg border border-verified-400 py-2 text-sm font-medium text-verified-700 hover:bg-verified-100">
            Compose another paper
          </button>
        </div>
      </div>
    );
  }

  const selectedMarks = Array.from(selected).reduce((sum, id) => sum + (bankQ.find((x) => x.id === id)?.marks ?? 0), 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      {/* Left: settings + add question panel */}
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
            <ClipboardCheck size={16} className="text-royal-500" /> Paper details
          </h2>
          {error && <div className="mb-3 rounded-md border border-alert-500/30 bg-alert-100 px-3 py-2 text-xs text-alert-600">{error}</div>}

          <label className="block text-xs font-medium text-slate-600">
            Paper Title *
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Class XII Physics Mid-Term 2026"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-royal-500 focus:outline-none focus:ring-1 focus:ring-royal-100" />
          </label>

          <label className="mt-3 block text-xs font-medium text-slate-600">
            Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
              <option>Physics</option><option>Mathematics</option><option>Chemistry</option><option>Biology</option>
            </select>
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1"><Clock size={11} /> Duration (min)</span>
              <input type="number" min={10} max={240} value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1"><CalendarClock size={11} /> Exam Date & Time</span>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
        </div>

        {/* Add questions section */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-900">Add Questions</span>
            {addMode !== "none" && (
              <button onClick={() => { setAddMode("none"); setError(null); }}
                className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            )}
          </div>

          {addMode === "none" && (
            <div className="flex gap-2">
              <button onClick={() => setAddMode("manual")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-royal-300 bg-royal-50 py-2 text-xs font-semibold text-royal-700 hover:bg-royal-100">
                <Plus size={13} /> Manual
              </button>
              <button onClick={() => setAddMode("csv")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                <Upload size={13} /> Upload CSV
              </button>
            </div>
          )}

          {/* Manual inline add */}
          {addMode === "manual" && (
            <div className="space-y-2">
              <textarea
                value={inlineQ.text} onChange={(e) => setInlineQ((q) => ({ ...q, text: e.target.value }))}
                placeholder="Question text…" rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input
                value={inlineQ.topic} onChange={(e) => setInlineQ((q) => ({ ...q, topic: e.target.value }))}
                placeholder="Topic (optional)" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <div className="space-y-1">
                {inlineQ.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setInlineQ((q) => ({ ...q, correctAnswer: i }))}
                      className={`h-5 w-5 shrink-0 rounded-full border text-[9px] font-bold ${inlineQ.correctAnswer === i ? "border-verified-500 bg-verified-500 text-white" : "border-slate-300 text-slate-400"}`}>
                      {OPTION_LABELS[i]}
                    </button>
                    <input value={opt}
                      onChange={(e) => { const n = [...inlineQ.options]; n[i] = e.target.value; setInlineQ((q) => ({ ...q, options: n })); }}
                      placeholder={`Option ${OPTION_LABELS[i]}`}
                      className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <select value={inlineQ.difficulty} onChange={(e) => setInlineQ((q) => ({ ...q, difficulty: e.target.value }))}
                  className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs">
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
                <input type="number" min={1} max={10} value={inlineQ.marks}
                  onChange={(e) => setInlineQ((q) => ({ ...q, marks: Number(e.target.value) }))}
                  className="w-16 rounded border border-slate-200 px-2 py-1 text-xs" />
                <span className="self-center text-xs text-slate-400">marks</span>
              </div>
              <p className="text-[10px] text-slate-400">Click option letter to mark as correct answer.</p>
              <button onClick={addInlineQuestion} disabled={addBusy}
                className="w-full rounded-md bg-royal-500 py-1.5 text-xs font-semibold text-white hover:bg-royal-600 disabled:opacity-50">
                {addBusy ? "Adding…" : "Add to Paper"}
              </button>
            </div>
          )}

          {/* CSV upload */}
          {addMode === "csv" && (
            <div className="space-y-2">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Paste CSV rows: <code className="bg-slate-100 px-1 rounded">question,A,B,C,D,correct(0-3),marks,difficulty,topic</code>
              </p>
              <textarea
                value={csvText} onChange={(e) => setCsvText(e.target.value)}
                placeholder={"What is Newton's 2nd law?,F=ma,F=mv,F=m/a,F=a/m,0,3,medium,Laws of Motion"}
                rows={5} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono" />
              <button onClick={uploadCSV} disabled={addBusy || !csvText.trim()}
                className="w-full rounded-md bg-royal-500 py-1.5 text-xs font-semibold text-white hover:bg-royal-600 disabled:opacity-50">
                {addBusy ? "Uploading…" : "Upload & Add to Paper"}
              </button>
            </div>
          )}
        </div>

        {/* Selection summary + finalize */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Selection</div>
          <div className="text-2xl font-bold text-navy-900">{selected.size} <span className="text-sm font-normal text-slate-500">questions · {selectedMarks} marks</span></div>
          {startAt && (
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <CalendarClock size={11} /> Scheduled: {new Date(startAt).toLocaleString()}
            </div>
          )}
          <button onClick={finalize} disabled={busy || selected.size === 0 || !title.trim()}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-verified-600 py-2.5 text-sm font-semibold text-white hover:bg-verified-700 disabled:opacity-40">
            <Lock size={14} />
            {busy ? "Locking to chain…" : "Finalize & Lock to Chain"}
          </button>
          <p className="mt-2 text-[10px] text-slate-400 text-center">SHA-256 hash sealed. Any tampering breaks chain.</p>
        </div>
      </div>

      {/* Right: approved question bank browser */}
      <div className="xl:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-navy-900">Question Bank — pick questions for this paper</span>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Filter:</span>
          {subjects.map((s) => (
            <button key={s} onClick={() => setSubjectFilter(s)}
              className={`rounded-full px-3 py-0.5 text-xs font-medium ${subjectFilter === s ? "bg-royal-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No approved questions yet — use "Manual" or "Upload CSV" above to add questions.
            </div>
          )}
          {filtered.map((q) => {
            const isSelected = selected.has(q.id);
            return (
              <button key={q.id} onClick={() => toggle(q.id)} className="w-full text-left">
                <div className={`rounded-lg border p-4 transition-all ${isSelected ? "border-royal-400 bg-royal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 ${isSelected ? "text-royal-500" : "text-slate-300"}`}>
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-royal-500">{q.subject}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500">{q.topic}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            q.difficulty === "easy" ? "bg-green-100 text-green-700"
                            : q.difficulty === "medium" ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                          }`}>{q.difficulty}</span>
                          <span className="text-[10px] font-semibold text-slate-600">{q.marks}m</span>
                        </span>
                      </div>
                      <p className="text-sm text-navy-900 leading-snug">{q.plainText ?? q.topic}</p>
                      {q.options && (
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          {q.options.map((opt, i) => (
                            <span key={i} className="text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                              {String.fromCharCode(65 + i)}. {opt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Auto-Variant tab ────────────────────────────────────────────────────────

interface VariantResult {
  paperId: string;
  title: string;
  subject: string;
  paperHash: string;
  variants: string[];
  variantHashes: Record<string, string>;
  questionsPerVariant: number;
  durationMinutes: number;
  startAt: number | null;
  chainBlock: { index: number; hash: string; timestamp: string };
  message: string;
}

const DIFF_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

function AutoVariant() {
  const [subject, setSubject] = useState("Physics");
  const [numVariants, setNumVariants] = useState(3);
  const [questionsPerVariant, setQuestionsPerVariant] = useState(10);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VariantResult | null>(null);

  // Pool stats preview
  const [pool, setPool] = useState<{ total: number; easy: number; medium: number; hard: number } | null>(null);

  async function loadPoolStats() {
    try {
      const r = await api<{ questions: BankQuestion[] }>("/api/paper-compose/questions");
      const qs = r.questions.filter((q) => q.subject === subject && q.options && q.options.length > 0);
      setPool({
        total: qs.length,
        easy:   qs.filter((q) => q.difficulty === "easy").length,
        medium: qs.filter((q) => q.difficulty === "medium").length,
        hard:   qs.filter((q) => q.difficulty === "hard").length,
      });
    } catch { setPool(null); }
  }

  useEffect(() => { loadPoolStats(); }, [subject]);

  const totalNeeded = numVariants * questionsPerVariant;
  const poolOk = pool ? pool.total >= totalNeeded : null;

  async function generate() {
    if (!title.trim()) { setError("Paper title required"); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<VariantResult>("/api/paper-compose/generate-variants", {
        method: "POST",
        body: JSON.stringify({
          title, subject, numVariants, questionsPerVariant,
          durationMinutes: duration,
          startAt: new Date(startAt).toISOString(),
        }),
      });
      setResult(r);
    } catch (err: any) {
      setError(err?.message ?? "Generation failed");
    } finally { setBusy(false); }
  }

  if (result) {
    return (
      <div className="mt-6 max-w-2xl">
        <div className="rounded-xl border-2 border-verified-500 bg-verified-50 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="rounded-full bg-verified-100 p-3">
              <Shuffle size={22} className="text-verified-600" />
            </div>
            <div>
              <div className="font-bold text-verified-800 text-lg">{result.variants.length} Variants Generated & Sealed</div>
              <div className="text-xs text-verified-600">Block #{result.chainBlock.index} · {new Date(result.chainBlock.timestamp).toLocaleString()}</div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
            <div><dt className="text-xs text-slate-500">Paper ID</dt><dd className="font-mono font-semibold text-navy-900">{result.paperId}</dd></div>
            <div><dt className="text-xs text-slate-500">Title</dt><dd className="font-semibold text-navy-900">{result.title}</dd></div>
            <div><dt className="text-xs text-slate-500">Questions / Variant</dt><dd className="font-semibold text-navy-900">{result.questionsPerVariant}</dd></div>
            <div><dt className="text-xs text-slate-500">Duration</dt><dd className="font-semibold text-navy-900">{result.durationMinutes} min</dd></div>
            {result.startAt && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Exam Scheduled</dt>
                <dd className="font-semibold text-navy-900 flex items-center gap-1.5">
                  <CalendarClock size={14} className="text-royal-500" />
                  {new Date(result.startAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
          {/* Per-variant hashes */}
          <div className="rounded-lg border border-verified-200 bg-white p-3 mb-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Variant Hashes (SHA-256 — each unique)</div>
            <div className="space-y-1.5">
              {result.variants.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-navy-900 text-white text-[10px] font-bold shrink-0">{v}</span>
                  <span className="font-mono text-[10px] text-slate-600 break-all">{result.variantHashes[v]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-verified-200 bg-white p-3 mb-4">
            <div className="text-xs text-slate-500 mb-1">Master Paper Hash (covers all variants)</div>
            <div className="font-mono text-xs break-all text-navy-900">{result.paperHash}</div>
          </div>
          <p className="text-xs text-slate-500 mb-3">{result.message}</p>
          <button onClick={() => { setResult(null); setTitle(""); setStartAt(defaultStartAt()); }}
            className="w-full rounded-lg border border-verified-400 py-2 text-sm font-medium text-verified-700 hover:bg-verified-100">
            Generate another paper
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-lg">
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Shuffle size={16} className="text-royal-500" /> Auto-Variant Generator
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          System pulls approved MCQs from the question bank, groups by difficulty, shuffles each group independently,
          then distributes into N variants — each variant gets the same difficulty balance but completely different
          question ordering. No two variants share the same sequence.
        </p>

        {error && <div className="rounded-md border border-alert-500/30 bg-alert-100 px-3 py-2 text-xs text-alert-600">{error}</div>}

        <label className="block text-xs font-medium text-slate-600">
          Paper Title *
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Class XII Physics Board 2026"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-royal-500 focus:outline-none focus:ring-1 focus:ring-royal-100" />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
            <option>Physics</option><option>Mathematics</option><option>Chemistry</option><option>Biology</option>
          </select>
        </label>

        {/* Pool stats */}
        {pool && (
          <div className={`rounded-lg border p-3 text-xs ${poolOk ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-1.5 font-semibold mb-1.5 text-slate-600">
              {poolOk ? <ShieldCheck size={12} className="text-green-600" /> : <AlertTriangle size={12} className="text-amber-600" />}
              Approved MCQ Pool — {subject}
            </div>
            <div className="flex gap-3">
              <span>Total: <b>{pool.total}</b></span>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <span key={d} className={`rounded-full px-1.5 py-0.5 font-medium ${DIFF_COLORS[d]}`}>{d}: {pool[d]}</span>
              ))}
            </div>
            {!poolOk && (
              <div className="mt-1.5 text-amber-700">
                Need {totalNeeded} questions total ({numVariants} × {questionsPerVariant}), have {pool.total}.
                Add more approved questions to the bank first.
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-600">
            Number of Variants (A–E)
            <input type="number" min={2} max={5} value={numVariants}
              onChange={(e) => setNumVariants(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Questions per Variant
            <input type="number" min={5} max={60} value={questionsPerVariant}
              onChange={(e) => setQuestionsPerVariant(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="flex items-center gap-1"><Clock size={11} /> Duration (min)</span>
            <input type="number" min={10} max={240} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="flex items-center gap-1"><CalendarClock size={11} /> Exam Date & Time</span>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-0.5">
          <div className="font-semibold text-slate-700 mb-1">What will be generated</div>
          <div>· {numVariants} variants (A–{["A","B","C","D","E"][numVariants-1]})</div>
          <div>· {questionsPerVariant} questions each = {totalNeeded} total from pool</div>
          <div>· Difficulty balanced (proportional easy/medium/hard split)</div>
          <div>· Each variant shuffled — no identical order possible</div>
          <div>· Each variant gets its own SHA-256 hash + master hash on chain</div>
        </div>

        <button onClick={generate} disabled={busy || !title.trim() || poolOk === false}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-royal-500 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-40">
          <Shuffle size={14} />
          {busy ? "Generating variants…" : `Generate ${numVariants} Variants & Seal to Chain`}
        </button>
      </div>
    </div>
  );
}

// ─── AI Assemble tab ──────────────────────────────────────────────────────────

function AIAssemble() {
  const [subject, setSubject] = useState("Physics");
  const [variantCount, setVariantCount] = useState(2);
  const [questionCount, setQuestionCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembleResponse | null>(null);
  const [log, setLog] = useState<{ t: string; msg: string; done?: boolean }[]>([]);
  const [langs, setLangs] = useState<Record<string, Lang>>({});
  const logTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);
  useEffect(() => () => { if (logTimer.current) clearInterval(logTimer.current); }, []);

  async function assemble() {
    setBusy(true); setError(null); setResult(null); setLangs({}); setLog([]);
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
        { t: new Date().toLocaleTimeString(), msg: `✓ ${r.variants.length} variants ready (${r.source === "claude" ? "Claude live" : "offline fallback"}) — fairness ${r.fairness.score}/100`, done: true },
      ]);
      setResult(r);
    } catch (err) {
      if (logTimer.current) clearInterval(logTimer.current);
      setError(err instanceof Error ? err.message : "Assembly failed");
      setLog((l) => [...l, { t: new Date().toLocaleTimeString(), msg: "✗ Assembly failed", done: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
            <Sparkles size={16} className="text-royal-500" /> Assemble paper
          </h2>
          {error && <div className="mb-3 rounded-md border border-alert-500/30 bg-alert-100 px-3 py-2 text-xs text-alert-600">{error}</div>}
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

        <div className="rounded-lg border border-navy-700 bg-navy-950 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Assembly log</h2>
          <div role="log" className="h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
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

        {result && (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
              <Scale size={16} className="text-verified-500" /> Fairness report
            </h2>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold ${result.fairness.score >= 80 ? "text-verified-600" : result.fairness.score >= 60 ? "text-amber-500" : "text-alert-600"}`}>
                {result.fairness.score}
              </span>
              <span className="pb-1 text-sm text-slate-500">/100 · {result.fairness.balance}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{result.fairness.notes}</p>
            <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <div className="flex items-center gap-2"><Hash size={13} className="shrink-0 text-royal-500" />
                <span className="truncate font-mono">{result.paperHash.slice(0, 24)}…</span>
              </div>
              <div className="mt-1 flex items-center gap-2"><ShieldCheck size={13} className="text-verified-500" />
                Paper {result.paperId} sealed on hash chain
              </div>
            </div>
          </div>
        )}
      </div>

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
                          <span className="ml-auto"><LangToggle value={lang} onChange={(l) => setLangs((s) => ({ ...s, [key]: l }))} /></span>
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
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Assembly() {
  const [tab, setTab] = useState<"manual" | "auto" | "ai">("manual");

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 2 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Paper Assembly</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Manually compose a paper, auto-generate balanced variants from the question bank, or let Claude assemble isomorphic variants.
        Every paper is SHA-256 hashed and locked to the chain — any tampering is immediately detectable.
      </p>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        <button onClick={() => setTab("manual")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tab === "manual" ? "bg-white shadow-sm text-navy-900" : "text-slate-500 hover:text-slate-700"}`}>
          <ClipboardCheck size={15} /> Manual
        </button>
        <button onClick={() => setTab("auto")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tab === "auto" ? "bg-white shadow-sm text-navy-900" : "text-slate-500 hover:text-slate-700"}`}>
          <Shuffle size={15} /> Auto-Variant
        </button>
        <button onClick={() => setTab("ai")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tab === "ai" ? "bg-white shadow-sm text-navy-900" : "text-slate-500 hover:text-slate-700"}`}>
          <Sparkles size={15} /> AI Assemble
        </button>
      </div>

      {tab === "manual" && <ManualCompose />}
      {tab === "auto"   && <AutoVariant />}
      {tab === "ai"     && <AIAssemble />}
    </div>
  );
}
