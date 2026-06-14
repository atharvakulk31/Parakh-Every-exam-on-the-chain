import { useState } from "react";
import { Trophy, Lock, RefreshCw, CheckCircle2, XCircle, MinusCircle, BarChart3, BookOpen, Hash, QrCode, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface QuestionBreakdown {
  index: number;
  questionId: string;
  text: string;
  options: string[];
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  studentAnswer: number | null;
  correctAnswer: number | null;
  isCorrect: boolean;
  isSkipped: boolean;
}

interface DetailedResult {
  rollHash: string;
  score: number;
  total: number;
  percentage: number;
  submittedAt: string;
  variant: string | null;
  paperId: string | null;
  questions: QuestionBreakdown[];
}

function grade(pct: number) {
  if (pct >= 90) return { label: "A+", color: "text-verified-600" };
  if (pct >= 75) return { label: "A", color: "text-verified-600" };
  if (pct >= 60) return { label: "B", color: "text-royal-500" };
  if (pct >= 50) return { label: "C", color: "text-amber-500" };
  if (pct >= 35) return { label: "D", color: "text-orange-500" };
  return { label: "F", color: "text-red-500" };
}

function diffColor(d: string) {
  if (d === "easy") return "bg-green-100 text-green-700";
  if (d === "hard") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export function StudentResults() {
  const { user } = useAuth();
  const [roll, setRoll] = useState(() => {
    try { return localStorage.getItem("lastRoll") ?? ""; } catch { return ""; }
  });
  const [state, setState] = useState<"idle" | "loading" | "pending" | "result" | "notfound" | "error">("idle");
  const [result, setResult] = useState<DetailedResult | null>(null);
  const [errMsg, setErrMsg] = useState("");

  async function fetchResult() {
    const r = roll.trim().toUpperCase();
    if (!r) return;
    try { localStorage.setItem("lastRoll", r); } catch {}
    setState("loading");
    try {
      const data = await api<DetailedResult>(`/api/exam/detailed-result?roll=${encodeURIComponent(r)}`);
      setResult(data);
      setState("result");
    } catch (err: any) {
      const body = err?.body ?? {};
      if (err?.status === 403) {
        setState("pending");
        setErrMsg(body.examState ?? "");
      } else if (err?.status === 404) {
        setState("notfound");
      } else if (err?.status === 401) {
        setState("error");
        setErrMsg("Session expired — please log out and log back in.");
      } else if (!err?.status) {
        setState("error");
        setErrMsg("Cannot reach server — check that the app is running.");
      } else {
        setState("error");
        setErrMsg(body.error ?? `Request failed (${err.status})`);
      }
    }
  }

  // Group questions by topic for topic-wise summary
  const topicMap: Record<string, { correct: number; total: number; marks: number; earned: number }> = {};
  if (result) {
    for (const q of result.questions) {
      const t = q.topic ?? "General";
      if (!topicMap[t]) topicMap[t] = { correct: 0, total: 0, marks: 0, earned: 0 };
      topicMap[t].total += 1;
      topicMap[t].marks += q.marks;
      if (q.isCorrect) {
        topicMap[t].correct += 1;
        topicMap[t].earned += q.marks;
      }
    }
  }

  const answered = result ? result.questions.filter((q) => !q.isSkipped).length : 0;
  const correct = result ? result.questions.filter((q) => q.isCorrect).length : 0;
  const wrong = result ? result.questions.filter((q) => !q.isSkipped && !q.isCorrect).length : 0;
  const skipped = result ? result.questions.filter((q) => q.isSkipped).length : 0;
  const g = result ? grade(result.percentage) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Trophy size={22} className="text-royal-500" />
        <h1 className="text-xl font-bold text-slate-900">My Results</h1>
      </div>

      {/* Roll input */}
      <div className="flex gap-3">
        <input
          className="w-64 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-royal-400"
          placeholder="Roll number (e.g. MH01-001)"
          value={roll}
          onChange={(e) => setRoll(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchResult()}
        />
        <button
          onClick={fetchResult}
          disabled={state === "loading"}
          className="flex items-center gap-2 rounded-lg bg-royal-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
        >
          {state === "loading" ? <RefreshCw size={15} className="animate-spin" /> : null}
          {state === "loading" ? "Checking…" : "Check Results"}
        </button>
      </div>

      {/* Pending state */}
      {state === "pending" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-10 text-center">
          <Lock size={40} className="text-amber-400" />
          <div className="text-lg font-semibold text-amber-800">Results Not Yet Released</div>
          <p className="max-w-sm text-sm text-amber-700">
            {errMsg === "active"
              ? "The exam is still active. Results will be available once the exam ends and the admin evaluates all submissions."
              : "Your answers are securely stored. The admin will unlock results after evaluation is complete."}
          </p>
          <div className="rounded-full bg-amber-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Exam State: {errMsg || "ended"}
          </div>
        </div>
      )}

      {/* Not found */}
      {state === "notfound" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
          No submission found for <strong>{roll.toUpperCase()}</strong>. Check the roll number and try again.
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* Full result */}
      {state === "result" && result && g && (
        <div className="space-y-6">
          {/* Score card */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className={`text-5xl font-black ${g.color}`}>{g.label}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">Grade</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="text-4xl font-black text-slate-900">{result.score}<span className="text-xl font-semibold text-slate-400">/{result.total}</span></div>
              <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">Score</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className={`text-4xl font-black ${g.color}`}>{result.percentage}%</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">Percentage</div>
            </div>
          </div>

          {/* Score bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex justify-between text-xs text-slate-500">
              <span>Score</span>
              <span>{result.percentage}%</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${result.percentage >= 60 ? "bg-verified-500" : result.percentage >= 35 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${result.percentage}%` }}
              />
            </div>
          </div>

          {/* Attempt summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Answered", val: answered, color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
              { label: "Correct", val: correct, color: "text-verified-600", bg: "bg-green-50 border-green-200" },
              { label: "Wrong", val: wrong, color: "text-red-600", bg: "bg-red-50 border-red-200" },
              { label: "Skipped", val: skipped, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
            ].map(({ label, val, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 text-center ${bg}`}>
                <div className={`text-3xl font-black ${color}`}>{val}</div>
                <div className="mt-0.5 text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {result.variant && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                <Hash size={11} /> Variant {result.variant}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
              Submitted {new Date(result.submittedAt).toLocaleString()}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-mono">
              {result.rollHash.slice(0, 16)}…
            </span>
          </div>

          {/* QR Marksheet Verifier */}
          <div className="flex items-start gap-5 rounded-xl border border-navy-200 bg-navy-50 p-5">
            <img
              src={`/api/verify/qr?roll=${encodeURIComponent(roll.trim().toUpperCase())}`}
              alt="Verification QR"
              className="h-28 w-28 shrink-0 rounded-lg border border-navy-200 bg-white p-1"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-navy-900">
                <QrCode size={16} className="text-royal-500" /> Tamper-Proof Marksheet QR
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Scan this QR with any phone to instantly verify this result on the Parakh blockchain. Anyone — student, parent, or institution — can confirm authenticity without logging in.
              </p>
              <a
                href={`/verify?roll=${encodeURIComponent(roll.trim().toUpperCase())}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-royal-600 hover:underline"
              >
                <ExternalLink size={11} /> Open verification page
              </a>
            </div>
          </div>

          {/* Topic-wise breakdown */}
          {Object.keys(topicMap).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
                <BarChart3 size={16} className="text-royal-500" /> Topic Performance
              </div>
              <div className="space-y-3">
                {Object.entries(topicMap).map(([topic, stat]) => {
                  const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
                  return (
                    <div key={topic}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{topic}</span>
                        <span className="text-slate-500">{stat.correct}/{stat.total} correct · {stat.earned}/{stat.marks} marks</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${pct >= 60 ? "bg-verified-500" : pct >= 35 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-question breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
              <BookOpen size={15} className="text-royal-500" /> Question-by-Question Review
            </div>
            <div className="divide-y divide-slate-50">
              {result.questions.map((q) => (
                <div key={q.questionId} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {q.isSkipped ? (
                        <MinusCircle size={18} className="text-slate-300" />
                      ) : q.isCorrect ? (
                        <CheckCircle2 size={18} className="text-verified-500" />
                      ) : (
                        <XCircle size={18} className="text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">Q{q.index}</span>
                        {q.topic && <span className="rounded bg-slate-100 px-1.5 py-0.5">{q.topic}</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${diffColor(q.difficulty)}`}>{q.difficulty}</span>
                        <span>{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{q.text}</p>
                      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {q.options.map((opt, i) => {
                          const isStudentPick = q.studentAnswer === i;
                          const isCorrectOpt = q.correctAnswer === i;
                          let cls = "rounded border px-3 py-1.5 text-xs ";
                          if (isCorrectOpt && isStudentPick) cls += "border-verified-400 bg-green-50 text-verified-700 font-semibold";
                          else if (isCorrectOpt) cls += "border-verified-400 bg-green-50 text-verified-700";
                          else if (isStudentPick && !isCorrectOpt) cls += "border-red-300 bg-red-50 text-red-600";
                          else cls += "border-slate-100 text-slate-500";
                          return (
                            <div key={i} className={cls}>
                              <span className="mr-1.5 font-bold">{String.fromCharCode(65 + i)}.</span>
                              {opt}
                              {isCorrectOpt && <span className="ml-1.5 text-[10px] font-bold text-verified-600">(correct)</span>}
                              {isStudentPick && !isCorrectOpt && <span className="ml-1.5 text-[10px] font-bold text-red-500">(your answer)</span>}
                              {isStudentPick && isCorrectOpt && <span className="ml-1.5 text-[10px] font-bold text-verified-600">(your answer ✓)</span>}
                            </div>
                          );
                        })}
                      </div>
                      {q.isSkipped && (
                        <p className="mt-1.5 text-xs text-slate-400 italic">Not attempted</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
