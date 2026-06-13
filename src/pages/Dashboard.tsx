import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import { ShieldAlert, Flag, Building2, Scale, Link2, FileCheck2, FileText, X, Copy, Check } from "lucide-react";
import { api, session } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Stats {
  leakAttemptsBlocked: number;
  proctoringFlags: number;
  centersLive: number;
  fairness: number | null;
  papersAssembled: number;
  questionCount: number;
  pendingQuestions: number;
  chainLength: number;
  byDifficulty: { easy: number; medium: number; hard: number };
  bySubject: { subject: string; count: number }[];
  activity: { minute: string; requests: number }[];
}

const DIFF_COLORS = { easy: "#30a46c", medium: "#f5a623", hard: "#e5484d" };

function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / ms, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function AnimatedNumber({ n }: { n: number }) {
  return <>{useCountUp(n)}</>;
}

function StatCard({ icon: Icon, label, value, tone = "navy" }: {
  icon: typeof ShieldAlert;
  label: string;
  value: ReactNode;
  tone?: "navy" | "alert" | "verified" | "pending";
}) {
  const tones = {
    navy: "bg-royal-100 text-royal-600",
    alert: "bg-alert-100 text-alert-600",
    verified: "bg-verified-100 text-verified-600",
    pending: "bg-pending-100 text-pending-500",
  };
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold text-navy-900">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session.access ? { Authorization: `Bearer ${session.access}` } : {}),
            ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setText((err as { error?: string }).error ?? "Report generation failed.");
          setStreaming(false);
          return;
        }

        // JSON fallback (no API key)
        const contentType = res.headers.get("Content-Type") ?? "";
        if (contentType.includes("application/json")) {
          const data = await res.json() as { report: string };
          if (!cancelled) { setText(data.report); setStreaming(false); }
          return;
        }

        // Streaming plain-text
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          setText((prev) => prev + decoder.decode(value, { stream: true }));
        }
      } catch {
        if (!cancelled) setText("Could not connect to report service.");
      } finally {
        if (!cancelled) setStreaming(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text]);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Threat Intelligence Report"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-navy-700 bg-navy-950 shadow-2xl"
        style={{ maxHeight: "80vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-royal-400" />
            <span className="text-sm font-semibold text-white">Post-Exam Threat Intelligence Report</span>
            {streaming && (
              <span className="flex items-center gap-1.5 rounded-full bg-verified-900/40 px-2 py-0.5 text-[10px] font-semibold text-verified-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-verified-400" />
                GENERATING
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              disabled={!text || streaming}
              className="flex items-center gap-1 rounded-md border border-navy-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
            >
              {copied ? <><Check size={12} className="text-verified-400" /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
            <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:text-slate-200">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Report body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!text && streaming ? (
            <div className="flex h-32 items-center justify-center">
              <span className="text-sm text-slate-500">Analysing exam session data…</span>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-200">
              {text}
              {streaming && <span className="ml-0.5 animate-pulse text-royal-400">█</span>}
            </pre>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="border-t border-navy-800 px-5 py-2.5 text-[10px] text-slate-600">
          Parakh · Aggregated statistics only — no candidate PII transmitted · Powered by Claude
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Stats>("/api/stats")
        .then((s) => alive && (setStats(s), setError(null)))
        .catch((e) => alive && setError(e instanceof Error ? e.message : "Stats unavailable"));
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const diffData = stats
    ? (["easy", "medium", "hard"] as const).map((d) => ({ name: d, count: stats.byDifficulty[d] }))
    : [];

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Command Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome, {user?.name}. Live view of the exam lifecycle — refreshes every 10s.
          </p>
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-2 rounded-lg border border-royal-300 bg-royal-50 px-4 py-2.5 text-sm font-semibold text-royal-700 hover:bg-royal-100 active:scale-95 transition-transform"
        >
          <FileText size={16} />
          Threat Report
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-pending-500/40 bg-pending-100 px-4 py-2 text-sm text-slate-700">
          Live stats unavailable ({error}) — retrying automatically.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={ShieldAlert} tone="alert" label="Leak attempts blocked" value={stats ? <AnimatedNumber n={stats.leakAttemptsBlocked} /> : "—"} />
        <StatCard icon={Flag} tone="pending" label="Proctoring flags" value={stats ? <AnimatedNumber n={stats.proctoringFlags} /> : "—"} />
        <StatCard icon={Building2} tone="navy" label="Centers live" value={stats ? <AnimatedNumber n={stats.centersLive} /> : "—"} />
        <StatCard icon={Scale} tone="verified" label="Fairness score" value={stats?.fairness != null ? <><AnimatedNumber n={stats.fairness} />/100</> : "n/a"} />
        <StatCard icon={FileCheck2} tone="navy" label="Papers assembled" value={stats ? <AnimatedNumber n={stats.papersAssembled} /> : "—"} />
        <StatCard icon={Link2} tone="verified" label="Hash chain blocks" value={stats ? <AnimatedNumber n={stats.chainLength} /> : "—"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-navy-900">API activity (last 10 min)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats?.activity ?? []}>
              <XAxis dataKey="minute" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip />
              <Area type="monotone" dataKey="requests" stroke="#2d5bff" fill="#e3e9ff" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-navy-900">Bank by difficulty</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={diffData} dataKey="count" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>
                {diffData.map((d) => (
                  <Cell key={d.name} fill={DIFF_COLORS[d.name as keyof typeof DIFF_COLORS]} />
                ))}
              </Pie>
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 xl:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-navy-900">
            Question bank by subject{" "}
            {stats && stats.pendingQuestions > 0 && (
              <span className="ml-2 rounded-full bg-pending-100 px-2 py-0.5 text-xs font-medium text-pending-500">
                {stats.pendingQuestions} pending review
              </span>
            )}
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.bySubject ?? []}>
              <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip />
              <Bar dataKey="count" fill="#2d5bff" radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
    </div>
  );
}
