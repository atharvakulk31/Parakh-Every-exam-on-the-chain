import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { FileText, EyeOff, CheckCircle2, Lock, Unlock, ShieldOff, ShieldCheck, Trophy } from "lucide-react";
import { api } from "../lib/api";

interface Script {
  code: string;
  subject: string;
  paperId: string;
  variant: string;
  status: "pending" | "evaluated";
  marks: number | null;
}

interface ExamState {
  examState: "active" | "ended" | "evaluated";
  totalSubmissions: number;
  pendingGrade: number;
  graded: number;
}

interface Result {
  rollHash: string;
  score: number;
  total: number;
  percentage: number;
  submittedAt: string;
}

export function Evaluation() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [scripts, setScripts] = useState<Script[]>([]);
  const [examState, setExamState] = useState<ExamState | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadScripts = useCallback(() => {
    api<{ scripts: Script[] }>("/api/evaluation/scripts")
      .then((r) => setScripts(r.scripts))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  const loadState = useCallback(() => {
    api<ExamState>("/api/evaluation/state")
      .then(setExamState)
      .catch(() => null);
  }, []);

  const loadResults = useCallback(() => {
    api<{ results: Result[] }>("/api/evaluation/results")
      .then((r) => setResults(r.results))
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadScripts();
    loadState();
  }, [loadScripts, loadState]);

  useEffect(() => {
    if (examState?.examState === "evaluated") loadResults();
  }, [examState?.examState, loadResults]);

  async function submitMarks(code: string) {
    setError(null);
    try {
      await api(`/api/evaluation/scripts/${code}`, { method: "POST", body: JSON.stringify({ marks: Number(marks[code]) }) });
      loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    }
  }

  async function endExam() {
    if (!confirm("End the exam? Students will no longer be able to submit.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/evaluation/end-exam", { method: "POST" });
      loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to end exam");
    } finally { setBusy(false); }
  }

  async function unlockAnswers() {
    if (!confirm("Unlock answer keys and auto-grade all submissions? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/evaluation/unlock-answers", { method: "POST" });
      loadState();
      loadScripts();
      loadResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlock answer keys");
    } finally { setBusy(false); }
  }

  const pending = scripts.filter((s) => s.status === "pending");
  const done = scripts.filter((s) => s.status === "evaluated");

  const stateBadge: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    active:    { label: "EXAM ACTIVE",    cls: "bg-green-100 text-green-700 border-green-300",   icon: <ShieldCheck size={13} /> },
    ended:     { label: "EXAM ENDED",     cls: "bg-orange-100 text-orange-700 border-orange-300", icon: <ShieldOff size={13} /> },
    evaluated: { label: "EVALUATED",      cls: "bg-royal-100 text-royal-700 border-royal-300",   icon: <CheckCircle2 size={13} /> },
  };
  const badge = examState ? stateBadge[examState.examState] : null;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 5 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Anonymised Evaluation</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Evaluators see a script code — never a name, roll number, or centre. Identity is sealed until
        results publish, and every mark entered lands on the hash chain.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      {/* Admin control panel */}
      {isAdmin && examState && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Exam State</div>
              {badge && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${badge.cls}`}>
                  {badge.icon}{badge.label}
                </span>
              )}
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xl font-bold text-navy-900">{examState.totalSubmissions}</div>
                <div className="text-xs text-slate-500">Submissions</div>
              </div>
              <div className="rounded-lg bg-orange-50 p-3">
                <div className="text-xl font-bold text-orange-600">{examState.pendingGrade}</div>
                <div className="text-xs text-slate-500">Ungraded</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-xl font-bold text-green-600">{examState.graded}</div>
                <div className="text-xs text-slate-500">Graded</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {examState.examState === "active" && (
                <button
                  onClick={endExam} disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  <Lock size={14} /> End Exam
                </button>
              )}
              {examState.examState === "ended" && (
                <button
                  onClick={unlockAnswers} disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-royal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
                >
                  <Unlock size={14} /> Unlock Answer Keys &amp; Auto-Grade
                </button>
              )}
              {examState.examState === "evaluated" && (
                <span className="flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  <CheckCircle2 size={14} /> All graded
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results table — shown after evaluated */}
      {examState?.examState === "evaluated" && results && results.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 bg-navy-900">
            <Trophy size={16} className="text-yellow-400" />
            <span className="text-sm font-bold text-white">Results</span>
            <span className="ml-auto text-xs text-slate-400">{results.length} candidates</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2">#</th>
                <th className="px-5 py-2">Roll Hash</th>
                <th className="px-5 py-2">Score</th>
                <th className="px-5 py-2">%</th>
                <th className="px-5 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {results
                .slice()
                .sort((a, b) => b.percentage - a.percentage)
                .map((r, i) => (
                  <tr key={r.rollHash} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-navy-900">{r.rollHash.slice(0, 16)}…</td>
                    <td className="px-5 py-2.5 font-semibold text-navy-900">{r.score}/{r.total}</td>
                    <td className="px-5 py-2.5">
                      <span className={`font-bold ${r.percentage >= 60 ? "text-green-600" : "text-red-500"}`}>{r.percentage}%</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-400">{new Date(r.submittedAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-royal-500/30 bg-royal-100 px-4 py-3 text-sm text-royal-600">
        <EyeOff size={16} />
        Identity firewall active — codes are one-way hashes of roll numbers. You cannot reverse them.
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-navy-900">
            Pending {pending.length > 0 && <span className="ml-1 rounded-full bg-pending-100 px-2 py-0.5 text-xs font-semibold text-pending-500">{pending.length}</span>}
          </h2>
          <div className="space-y-3">
            {pending.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                All scripts evaluated.
              </div>
            )}
            {pending.map((s) => (
              <div key={s.code} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-royal-500" />
                  <span className="font-mono font-semibold text-navy-900">{s.code}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.subject}</span>
                  <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs font-semibold text-white">Variant {s.variant}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600" htmlFor={`marks-${s.code}`}>Marks (0–13)</label>
                  <input
                    id={`marks-${s.code}`}
                    type="number" min={0} max={13}
                    value={marks[s.code] ?? ""}
                    onChange={(e) => setMarks((m) => ({ ...m, [s.code]: e.target.value }))}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => submitMarks(s.code)}
                    disabled={marks[s.code] === undefined || marks[s.code] === ""}
                    className="rounded-md bg-royal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal-600 disabled:opacity-40"
                  >
                    Seal marks on chain
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-navy-900">Evaluated ({done.length})</h2>
          <div className="space-y-2">
            {done.map((s) => (
              <div key={s.code} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
                <CheckCircle2 size={16} className="text-verified-500" />
                <span className="font-mono font-semibold text-navy-900">{s.code}</span>
                <span className="text-xs text-slate-500">Variant {s.variant}</span>
                <span className="ml-auto font-semibold text-navy-900">{s.marks}/13</span>
                <span className="text-xs text-verified-600">on chain</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
