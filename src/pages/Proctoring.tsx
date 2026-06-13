import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, MonitorX, Eye, AlertTriangle, Check, X } from "lucide-react";
import { api } from "../lib/api";

interface Flag {
  id: number;
  timestamp: string;
  centerId: string;
  candidate: string;
  type: string;
  severity: "low" | "medium" | "high";
  status: "open" | "confirmed" | "dismissed";
}

const SEV_BADGE = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-pending-100 text-pending-500",
  high: "bg-alert-100 text-alert-600",
};
const TYPE_LABEL: Record<string, string> = {
  tab_switch: "Tab switch",
  fullscreen_exit: "Fullscreen exit",
  focus_loss: "Focus loss",
  multiple_faces: "Multiple faces",
  no_face: "Face not visible",
};

const SIM_CANDIDATES = [
  { roll: "MH01-001", center: "MH01" },
  { roll: "MH02-002", center: "MH02" },
  { roll: "DL01-003", center: "DL01" },
];

export function Proctoring() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<"pending" | "granted" | "declined">("pending");
  const [camError, setCamError] = useState<string | null>(null);
  const [watchEvents, setWatchEvents] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastEvent = useRef(0);

  const load = useCallback(() => {
    api<{ flags: Flag[] }>("/api/proctoring/flags")
      .then((r) => setFlags(r.flags))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);

  // Webcam only after explicit consent
  useEffect(() => {
    if (consent !== "granted") return;
    navigator.mediaDevices.getUserMedia({ video: { width: 320 }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e) => setCamError(e instanceof Error ? e.message : "Camera unavailable"));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [consent]);

  const postFlag = useCallback((type: string, candidate = "MH01-001", centerId = "MH01") => {
    api("/api/proctoring/flags", { method: "POST", body: JSON.stringify({ type, candidate, centerId }) })
      .then(load)
      .catch(() => {});
  }, [load]);

  // Real browser events on this tab stand in for the candidate's browser:
  // switch tabs / blur this window while armed → a flag appears in the queue.
  useEffect(() => {
    if (!watchEvents) return;
    const throttled = (type: string) => {
      if (Date.now() - lastEvent.current < 3000) return;
      lastEvent.current = Date.now();
      postFlag(type, "LIVE-DEMO", "MH01");
    };
    const onVis = () => document.visibilityState === "hidden" && throttled("tab_switch");
    const onBlur = () => throttled("focus_loss");
    const onFs = () => !document.fullscreenElement && throttled("fullscreen_exit");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [watchEvents, postFlag]);

  async function decide(id: number, action: "confirm" | "dismiss") {
    try {
      await api(`/api/proctoring/flags/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Decision failed"); }
  }

  const open = flags.filter((f) => f.status === "open");
  const decided = flags.filter((f) => f.status !== "open").slice(0, 8);

  return (
    <div>
      {/* Privacy consent modal — webcam never starts without it */}
      {consent === "pending" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 id="consent-title" className="flex items-center gap-2 text-lg font-semibold text-navy-900">
              <Camera size={20} className="text-royal-500" /> Webcam privacy consent
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The invigilator console can show your own webcam as a live demo feed. Video stays in your
              browser — it is <strong>never uploaded, recorded, or analysed by a server</strong>. AI flags
              in this demo come from browser events and simulation, not from video.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConsent("granted")}
                className="flex-1 rounded-md bg-royal-500 py-2 text-sm font-semibold text-white hover:bg-royal-600">
                Allow webcam
              </button>
              <button onClick={() => setConsent("declined")}
                className="flex-1 rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Use simulated feeds
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 4 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Proctoring Console</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        AI only raises flags — a human invigilator confirms or dismisses every single one, and each
        decision is written to the hash chain. No automated disqualifications, ever.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Feeds */}
        <div className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-navy-900">Exam hall feeds</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setWatchEvents((w) => !w)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${watchEvents ? "bg-alert-500 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                <MonitorX size={14} /> {watchEvents ? "Watching this browser — switch tabs to trigger a flag" : "Arm browser-event detection"}
              </button>
              <button onClick={() => postFlag("multiple_faces", "KA01-002", "KA01")}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <AlertTriangle size={14} /> Inject AI flag
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Webcam or fallback tile */}
            <div className="relative aspect-video overflow-hidden rounded-lg bg-navy-950">
              {consent === "granted" && !camError ? (
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-500">
                  <CameraOff size={28} />
                  <span className="mt-2 text-xs">{camError ?? "Simulated feed"}</span>
                </div>
              )}
              <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-navy-950/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-alert-500" /> LIVE · MH01-001 (you)
              </span>
            </div>
            {SIM_CANDIDATES.map((c, i) => (
              <div key={c.roll} className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950">
                <div className="flex h-full items-center justify-center">
                  <Eye size={26} className={`text-slate-600 ${i === 1 ? "animate-pulse" : ""}`} />
                </div>
                <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-navy-950/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-verified-500" /> SIM · {c.roll}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Honest AI: feeds are simulated (your webcam stays local). Flags come from real browser events
            and injected anomalies — exactly the signals a production system would use.
          </p>
        </div>

        {/* Flag queue */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-navy-900">
            Flag queue {open.length > 0 && <span className="ml-1 rounded-full bg-alert-100 px-2 py-0.5 text-xs font-semibold text-alert-600">{open.length} open</span>}
          </h2>
          <div className="space-y-2">
            {open.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                No open flags. Arm event detection and switch tabs to raise one.
              </div>
            )}
            {open.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold uppercase ${SEV_BADGE[f.severity]}`}>{f.severity}</span>
                  <span className="font-semibold text-navy-900">{TYPE_LABEL[f.type] ?? f.type}</span>
                  <span className="ml-auto font-mono text-slate-500">{f.timestamp.slice(11, 19)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{f.candidate} · centre {f.centerId}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(f.id, "confirm")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-alert-500 py-1.5 text-xs font-semibold text-white hover:bg-alert-600">
                    <Check size={13} /> Confirm
                  </button>
                  <button onClick={() => decide(f.id, "dismiss")}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <X size={13} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
            {decided.length > 0 && (
              <>
                <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Decided (on chain)</div>
                {decided.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <span className={f.status === "confirmed" ? "text-alert-600" : "text-verified-600"}>
                      {f.status === "confirmed" ? "✗ Confirmed" : "✓ Dismissed"}
                    </span>
                    <span>{TYPE_LABEL[f.type] ?? f.type} · {f.candidate}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
