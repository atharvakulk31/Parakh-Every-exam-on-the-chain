import { useEffect, useRef, useState } from "react";
import { ClipboardList, Clock, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lock, Hash, CalendarClock, BookOpen, BarChart3, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { FaceProctor } from "../components/FaceProctor";

interface ExamQuestion {
  id: string;
  subject: string;
  topic: string;
  plainText: string | null;
  options: string[];
  marks: number;
  difficulty: string;
}

interface PaperResponse {
  assignment: { rollNumber: string; centerId: string; paperId: string; variant: string };
  questions: ExamQuestion[];
  duration: number;
  endsAt: number;
}

interface StatusResponse {
  live: boolean;
  startAt: number | null;
  endsAt: number | null;
  duration: number;
}

interface SubmitResponse {
  submitted: boolean;
  answered: number;
  skipped: number;
  total: number;
  submittedAt: string;
  message: string;
}

interface ResultResponse {
  rollHash: string;
  score: number;
  total: number;
  percentage: number;
  submittedAt: string;
}

interface SealedInfo {
  assignment: { rollNumber: string; centerId: string; paperId: string; variant: string };
  paper: {
    paperId: string;
    title: string | null;
    subject: string;
    questionCount: number | null;
    paperHash: string | null;
    finalizedAt: string | null;
    finalizedBy: string | null;
  } | null;
  exam: { live: boolean; startAt: number | null; endsAt: number | null; duration: number };
  examDuration: number;
  chainBlock: { index: number; hash: string; timestamp: string } | null;
}

type State = "setup" | "loading" | "locked" | "live" | "submitting" | "submitted" | "result";

function fmt(ms: number) {
  if (ms <= 0) return "00:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExamPage() {
  const { user } = useAuth();
  const [state, setState] = useState<State>("setup");
  const [roll, setRoll] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitInfo, setSubmitInfo] = useState<SubmitResponse | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [resultPending, setResultPending] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sealed, setSealed] = useState<SealedInfo | null>(null);
  const [flagCount, setFlagCount] = useState(0);
  const [lockCountdown, setLockCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll exam status when locked + countdown
  useEffect(() => {
    if (state !== "locked") return;
    const poll = setInterval(async () => {
      const s = await api<StatusResponse>("/api/exam/status").catch(() => null);
      setStatus(s);
      if (s?.live) {
        clearInterval(poll);
        await loadPaper(roll);
      }
    }, 5000);
    const tick = setInterval(() => {
      setLockCountdown((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [state, roll]);

  // Countdown timer
  useEffect(() => {
    if (state !== "live" || !paper) return;
    const tick = () => {
      const left = Math.max(0, paper.endsAt - Date.now());
      setTimeLeft(left);
      if (left === 0) handleSubmit(true);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state, paper]);

  // Tab-switch detection
  useEffect(() => {
    if (state !== "live") return;
    const onVisChange = () => {
      if (document.hidden && roll) {
        setFlagCount((n) => n + 1);
        api("/api/exam/flag", { method: "POST", body: JSON.stringify({ rollNumber: roll, type: "tab_switch" }) }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [state, roll]);

  async function checkRoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("loading");
    const rollUpper = roll.toUpperCase().trim();
    setRoll(rollUpper);
    const s = await api<StatusResponse>("/api/exam/status").catch(() => null);
    setStatus(s);
    if (!s?.live) {
      // Fetch sealed paper info for the locked view
      const si = await api<SealedInfo>(`/api/exam/sealed?roll=${rollUpper}`).catch(() => null);
      setSealed(si);
      if (si?.exam.startAt) setLockCountdown(Math.max(0, si.exam.startAt - Date.now()));
      setState("locked");
      return;
    }
    await loadPaper(rollUpper);
  }

  async function loadPaper(rollNumber: string) {
    setError(null);
    try {
      const p = await api<PaperResponse>(`/api/exam/paper?roll=${rollNumber}`);
      setPaper(p);
      setTimeLeft(Math.max(0, p.endsAt - Date.now()));
      setState("live");
    } catch (err: any) {
      if (err?.message?.includes("Already submitted")) {
        setError("You have already submitted this exam.");
      } else {
        setError(err?.message ?? "Failed to load paper");
      }
      setState("setup");
    }
  }

  async function handleSubmit(auto = false) {
    if (!auto) {
      const answered = Object.keys(answers).length;
      const total = paper?.questions.length ?? 0;
      if (answered < total) {
        const ok = window.confirm(`You've answered ${answered}/${total} questions. Submit anyway?`);
        if (!ok) return;
      }
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setState("submitting");
    try {
      const res = await api<SubmitResponse>("/api/exam/submit", {
        method: "POST",
        body: JSON.stringify({ rollNumber: roll, answers }),
      });
      setSubmitInfo(res);
      setState("submitted");
    } catch (err: any) {
      setError(err?.message ?? "Submission failed");
      setState("live");
    }
  }

  async function checkResult() {
    setResultPending(null);
    try {
      const res = await api<ResultResponse>(`/api/exam/result?roll=${roll}`);
      setResult(res);
      setState("result");
    } catch (err: any) {
      setResultPending(err?.message ?? "Results not yet released");
    }
  }

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (state === "setup" || state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <ClipboardList size={40} className="mx-auto mb-3 text-royal-500" />
            <h1 className="font-display text-2xl font-bold text-navy-900">Student Exam Portal</h1>
            <p className="mt-1 text-sm text-slate-500">Enter your roll number to begin</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-alert-500/30 bg-alert-100 px-4 py-3 text-sm text-alert-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={checkRoll} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-navy-900">Roll Number</label>
            <input
              value={roll}
              onChange={(e) => setRoll(e.target.value.toUpperCase())}
              placeholder="e.g. MH01-001"
              required
              disabled={state === "loading"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-royal-500 focus:outline-none focus:ring-2 focus:ring-royal-100 disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs text-slate-400">Demo rolls: MH01-001 · MH02-001 · DL01-001 · KA01-001</p>
            <button
              type="submit"
              disabled={state === "loading"}
              className="mt-4 w-full rounded-lg bg-royal-500 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
            >
              {state === "loading" ? "Checking…" : "Enter Exam"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Logged in as <strong>{user?.name}</strong> · Any tab switch will be flagged
          </p>
        </div>
      </div>
    );
  }

  // ── Locked / waiting screen ───────────────────────────────────────────────
  if (state === "locked") {
    const paper = sealed?.paper;
    const startAt = sealed?.exam.startAt ?? status?.startAt ?? null;
    const durationMs = sealed?.examDuration ?? status?.duration ?? 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-10">
        <div className="w-full max-w-lg">
          {/* Sealed envelope header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 shadow-lg">
              <Lock size={28} className="text-white" />
            </div>
            <h2 className="font-display text-2xl font-bold text-navy-900">
              {paper?.title ?? "Paper Sealed"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Your exam paper is sealed on the blockchain — contents are encrypted until the scheduled start time.
            </p>
          </div>

          {/* Paper info card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between bg-navy-900 px-5 py-3">
              <div className="text-sm font-semibold text-white">{paper?.paperId ?? sealed?.assignment.paperId ?? "—"}</div>
              <span className="rounded-full bg-navy-700 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
                {paper?.subject ?? "—"} · Variant {sealed?.assignment.variant ?? "A"}
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <BookOpen size={15} className="mt-0.5 shrink-0 text-royal-500" />
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Questions</div>
                    <div className="font-semibold text-navy-900">
                      {paper?.questionCount != null ? `${paper.questionCount} MCQs` : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock size={15} className="mt-0.5 shrink-0 text-royal-500" />
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Duration</div>
                    <div className="font-semibold text-navy-900">{Math.round(durationMs / 60000)} min</div>
                  </div>
                </div>
                <div className="col-span-2 flex items-start gap-2">
                  <CalendarClock size={15} className="mt-0.5 shrink-0 text-royal-500" />
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Exam opens at</div>
                    <div className="font-semibold text-navy-900">
                      {startAt ? new Date(startAt).toLocaleString() : "Not yet scheduled"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Countdown */}
              {lockCountdown > 0 && (
                <div className="rounded-xl border border-royal-200 bg-royal-50 px-4 py-4 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-royal-600 mb-1">Opens in</div>
                  <div className="font-mono text-4xl font-bold text-royal-600">{fmt(lockCountdown)}</div>
                </div>
              )}
              {lockCountdown === 0 && startAt && Date.now() >= startAt && (
                <div className="rounded-xl border border-verified-300 bg-verified-50 px-4 py-3 text-center text-sm font-semibold text-verified-700">
                  Exam is live — loading paper…
                </div>
              )}

              {/* Chain proof */}
              {sealed?.chainBlock && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    <Hash size={11} /> Blockchain Proof · Block #{sealed.chainBlock.index}
                  </div>
                  {paper?.paperHash && (
                    <div className="mb-1">
                      <div className="text-[9px] text-slate-400 mb-0.5">Paper Hash (SHA-256)</div>
                      <div className="font-mono text-[10px] text-navy-900 break-all leading-relaxed">
                        {paper.paperHash}
                      </div>
                    </div>
                  )}
                  <div className="mt-1">
                    <div className="text-[9px] text-slate-400 mb-0.5">Chain Block Hash</div>
                    <div className="font-mono text-[10px] text-navy-900 break-all leading-relaxed">
                      {sealed.chainBlock.hash}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-verified-600">
                    <ShieldCheck size={11} /> Sealed at {new Date(sealed.chainBlock.timestamp).toLocaleString()}
                  </div>
                </div>
              )}

              {!sealed?.chainBlock && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                  Paper not yet assigned or sealed — awaiting teacher action.
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Roll: <strong>{roll}</strong> · Centre: <strong>{sealed?.assignment.centerId ?? "—"}</strong> · Auto-checks every 5s
          </p>
        </div>
      </div>
    );
  }

  // ── Live exam ─────────────────────────────────────────────────────────────
  if ((state === "live" || state === "submitting") && paper) {
    const answered = Object.keys(answers).length;
    const total = paper.questions.length;
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

    return (
      <div>
        {state === "live" && <FaceProctor rollNumber={roll} />}
        {/* Sticky header bar */}
        <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-royal-500">Live Exam</span>
            <span className="ml-2 text-xs text-slate-400">Roll: {paper.assignment.rollNumber} · Paper {paper.assignment.paperId} · Variant {paper.assignment.variant}</span>
          </div>
          <div className="flex items-center gap-4">
            {flagCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-alert-100 px-2.5 py-0.5 text-xs font-medium text-alert-600">
                <AlertTriangle size={11} /> {flagCount} tab switch{flagCount > 1 ? "es" : ""} flagged
              </span>
            )}
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-bold ${timeLeft < 300_000 ? "bg-alert-100 text-alert-600" : "bg-navy-900 text-white"}`}>
              <Clock size={13} />
              {fmt(timeLeft)}
            </div>
            <button
              onClick={() => handleSubmit(false)}
              disabled={state === "submitting"}
              className="rounded-lg bg-royal-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
            >
              {state === "submitting" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex-1 rounded-full bg-slate-100 h-2">
            <div className="h-2 rounded-full bg-royal-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500 shrink-0">{answered}/{total} answered</span>
        </div>

        {/* Questions */}
        <div className="space-y-5">
          {paper.questions.map((q, qi) => {
            const selected = answers[q.id];
            return (
              <div key={q.id} className={`rounded-xl border p-5 transition-all ${selected !== undefined ? "border-royal-300 bg-royal-50/40" : "border-slate-200 bg-white"}`}>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">{qi + 1}</span>
                    <p className="text-sm font-medium text-navy-900">{q.plainText ?? q.topic}</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {q.marks} mark{q.marks > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all ${
                        selected === oi
                          ? "border-royal-500 bg-royal-500 text-white font-medium"
                          : "border-slate-200 bg-white text-slate-700 hover:border-royal-300 hover:bg-royal-50"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${selected === oi ? "border-white/40 bg-white/20 text-white" : "border-slate-300 text-slate-500"}`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => handleSubmit(false)}
            disabled={state === "submitting"}
            className="rounded-lg bg-royal-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
          >
            {state === "submitting" ? "Submitting…" : "Submit Exam"}
          </button>
        </div>
      </div>
    );
  }

  // ── Submitted screen (no score yet — admin must unlock) ──────────────────
  if (state === "submitted" && submitInfo) {
    const coverage = submitInfo.total > 0 ? Math.round((submitInfo.answered / submitInfo.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="mb-4 rounded-full bg-verified-100 p-4">
          <CheckCircle2 size={40} className="text-verified-600" />
        </div>
        <h2 className="font-display text-2xl font-bold text-navy-900">Exam Submitted</h2>
        <p className="mt-1 text-sm text-slate-500">Roll: {roll} · Paper: {paper?.assignment.paperId}</p>

        {/* Attempt summary — no score */}
        <div className="mt-6 w-full max-w-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-navy-900">
              <BarChart3 size={16} className="text-royal-500" /> Attempt Summary
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-2xl font-bold text-navy-900">{submitInfo.total}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Total</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-2xl font-bold text-green-600">{submitInfo.answered}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Answered</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <div className="text-2xl font-bold text-amber-600">{submitInfo.skipped}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Skipped</div>
              </div>
            </div>
            {/* Coverage bar */}
            <div className="mb-1 flex justify-between text-[10px] text-slate-400">
              <span>Coverage</span><span>{coverage}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-royal-500 transition-all" style={{ width: `${coverage}%` }} />
            </div>
          </div>

          {/* Score locked notice */}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <Lock size={14} /> Score Sealed
            </div>
            Your answers are recorded securely. Score will be released only after the Controller of Examinations unlocks the answer keys.
          </div>

          {/* Check result button */}
          {resultPending && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              {resultPending}
            </div>
          )}
          <button
            onClick={checkResult}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-royal-300 bg-white py-2.5 text-sm font-semibold text-royal-600 hover:bg-royal-50"
          >
            <RefreshCw size={14} /> Check if Results Released
          </button>
        </div>

        {flagCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-alert-500/30 bg-alert-100 px-4 py-2.5 text-sm text-alert-600">
            <AlertTriangle size={14} />
            {flagCount} proctoring flag{flagCount > 1 ? "s" : ""} raised — visible to admin
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-verified-500/30 bg-verified-100 px-4 py-2.5 text-sm text-verified-700">
          <ShieldCheck size={15} /> Submission sealed on Parakh hash chain
        </div>
      </div>
    );
  }

  // ── Result screen (after admin unlocks answer keys) ───────────────────────
  if (state === "result" && result) {
    const grade = result.percentage >= 85 ? "A" : result.percentage >= 70 ? "B" : result.percentage >= 55 ? "C" : result.percentage >= 40 ? "D" : "F";
    const gradeColor = result.percentage >= 70 ? "text-verified-600" : result.percentage >= 40 ? "text-amber-600" : "text-alert-600";
    const passed = result.percentage >= 40;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className={`mb-4 rounded-full p-4 ${passed ? "bg-verified-100" : "bg-alert-100"}`}>
          {passed ? <CheckCircle2 size={40} className="text-verified-600" /> : <XCircle size={40} className="text-alert-600" />}
        </div>
        <h2 className="font-display text-2xl font-bold text-navy-900">Results Released</h2>
        <p className="mt-1 text-sm text-slate-500">Roll: {roll} · Submitted: {new Date(result.submittedAt).toLocaleString()}</p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-3xl font-bold text-navy-900">{result.score}<span className="text-lg text-slate-400">/{result.total}</span></div>
            <div className="mt-0.5 text-xs text-slate-500">Score</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`text-3xl font-bold ${gradeColor}`}>{result.percentage}%</div>
            <div className="mt-0.5 text-xs text-slate-500">Percentage</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`text-3xl font-bold ${gradeColor}`}>{grade}</div>
            <div className="mt-0.5 text-xs text-slate-500">Grade</div>
          </div>
        </div>

        {flagCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-alert-500/30 bg-alert-100 px-4 py-2.5 text-sm text-alert-600">
            <AlertTriangle size={14} />
            {flagCount} proctoring flag{flagCount > 1 ? "s" : ""} raised during exam — visible to admin
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-verified-500/30 bg-verified-100 px-4 py-2.5 text-sm text-verified-700">
          <ShieldCheck size={15} /> Result verified on Parakh hash chain
        </div>
        <p className="mt-3 text-xs text-slate-400 font-mono">{result.rollHash.slice(0, 24)}… · verifiable at /verification</p>
      </div>
    );
  }

  return null;
}
