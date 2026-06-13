import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, Truck, CalendarClock, History } from "lucide-react";
import { api } from "../lib/api";

interface Center {
  id: string;
  name: string;
  city: string;
  variant: string | null;
  paperId: string | null;
  status: "idle" | "sealed" | "unlocked";
  custody: { timestamp: string; event: string }[];
}
interface CentersResponse {
  centers: Center[];
  examStartAt: number | null;
  serverNow: number;
  papersAvailable: string[];
}

function fmt(ms: number): string {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Centers() {
  const [data, setData] = useState<CentersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(2);
  const [now, setNow] = useState(Date.now());
  const [decrypting, setDecrypting] = useState(false);
  const clockSkew = useRef(0);
  const unlockFired = useRef(false);

  const load = useCallback(() => {
    api<CentersResponse>("/api/centers")
      .then((d) => {
        clockSkew.current = d.serverNow - Date.now();
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const serverNow = now + clockSkew.current;
  const remaining = data?.examStartAt ? data.examStartAt - serverNow : null;
  const sealedCount = data?.centers.filter((c) => c.status === "sealed").length ?? 0;

  // T-zero: fire unlock once, play decrypt animation
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && sealedCount > 0 && !unlockFired.current) {
      unlockFired.current = true;
      setDecrypting(true);
      api("/api/centers/unlock", { method: "POST" })
        .then(() => setTimeout(() => { setDecrypting(false); load(); }, 2200))
        .catch(() => { setDecrypting(false); unlockFired.current = false; });
    }
  }, [remaining, sealedCount, load]);

  async function schedule() {
    setError(null);
    try {
      unlockFired.current = false;
      await api("/api/centers/schedule", { method: "POST", body: JSON.stringify({ minutes }) });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Schedule failed"); }
  }

  async function distribute() {
    setError(null);
    try {
      await api("/api/centers/distribute", { method: "POST" });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Distribute failed"); }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 3 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Secure Distribution</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Each centre receives a different sealed variant under time-locked encryption. Nobody — not even
        the controller — can read the paper before T-zero. Every handoff is chained.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      {/* Countdown + controls */}
      <div className="mt-6 flex flex-wrap items-stretch gap-4">
        <div className={`flex min-w-56 flex-col items-center justify-center rounded-lg px-8 py-5 text-white ${remaining !== null && remaining <= 0 ? "bg-verified-600" : "bg-navy-900"}`}>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
            {remaining === null ? "Exam not scheduled" : remaining <= 0 ? "T-zero reached" : "Time to T-zero"}
          </div>
          <div className="font-mono text-4xl font-bold tabular-nums">
            {remaining === null ? "--:--" : fmt(remaining)}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <input type="number" min={0.5} max={180} step={0.5} value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <span className="text-xs text-slate-500">min</span>
            <button onClick={schedule}
              className="flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800">
              <CalendarClock size={14} /> Schedule T-zero
            </button>
          </div>
          <button onClick={distribute}
            className="flex items-center justify-center gap-1.5 rounded-md bg-royal-500 px-3 py-2 text-xs font-semibold text-white hover:bg-royal-600">
            <Truck size={14} /> Distribute latest paper
          </button>
        </div>

        {decrypting && (
          <div className="flex items-center gap-3 rounded-lg border-2 border-verified-500 bg-verified-100 px-6 font-mono text-sm font-semibold text-verified-600">
            <span className="animate-spin">◌</span> T-ZERO — DECRYPTING PACKAGES…
          </div>
        )}
      </div>

      {/* Center cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data?.centers.map((c) => (
          <div key={c.id}
            className={`rounded-lg border bg-white transition-all duration-700 ${
              c.status === "unlocked" ? "border-verified-500 shadow-lg shadow-verified-100" : "border-slate-200"
            } ${decrypting && c.status === "sealed" ? "animate-pulse" : ""}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-navy-900">{c.id} · {c.city}</div>
                <div className="text-xs text-slate-500">{c.name}</div>
              </div>
              {c.status === "unlocked" ? (
                <LockOpen size={20} className="text-verified-500" />
              ) : (
                <Lock size={20} className={c.status === "sealed" ? "text-royal-500" : "text-slate-300"} />
              )}
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${
                  c.status === "unlocked" ? "bg-verified-100 text-verified-600"
                  : c.status === "sealed" ? "bg-royal-100 text-royal-600"
                  : "bg-slate-100 text-slate-500"
                }`}>
                  {c.status === "unlocked" ? "DECRYPTED" : c.status === "sealed" ? "SEALED" : "AWAITING"}
                </span>
                {c.variant && <span className="rounded-full bg-navy-900 px-2 py-0.5 font-semibold text-white">Variant {c.variant}</span>}
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <History size={12} /> Chain of custody
                </div>
                {c.custody.length === 0 ? (
                  <div className="text-xs text-slate-500">No package yet.</div>
                ) : (
                  <ul className="space-y-1">
                    {c.custody.map((e, i) => (
                      <li key={i} className="text-[11px] leading-snug text-slate-600">
                        <span className="font-mono text-slate-500">{e.timestamp.slice(11, 19)}</span> — {e.event}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
