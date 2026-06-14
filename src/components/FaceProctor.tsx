import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "@vladmandic/face-api";
import { Camera, CameraOff, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const DETECT_INTERVAL = 3000;
const NO_FACE_THRESHOLD = 2; // consecutive misses before flagging
const FLAG_COOLDOWN = 30_000;

type FaceStatus = "ok" | "none" | "multiple" | "away";
type LoadState = "loading" | "ready" | "error" | "no_cam";

interface Props {
  rollNumber: string;
}

const STATUS_CFG: Record<FaceStatus, { bar: string; text: string; dot: string }> = {
  ok:       { bar: "bg-verified-500", text: "✓ Face OK",         dot: "bg-verified-500" },
  none:     { bar: "bg-red-500",      text: "⚠ No Face",         dot: "bg-red-500" },
  multiple: { bar: "bg-amber-500",    text: "! Multiple Faces",  dot: "bg-amber-500" },
  away:     { bar: "bg-amber-400",    text: "↩ Looking Away",    dot: "bg-amber-400" },
};

export function FaceProctor({ rollNumber }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const cooldownRef = useRef<Record<string, number>>({});
  const noFaceCount = useRef(0);

  const [loadState, setLoadState]   = useState<LoadState>("loading");
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("ok");
  const [collapsed, setCollapsed]   = useState(false);

  // Load models once
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ]);
        setLoadState("ready");
      } catch {
        setLoadState("error");
      }
    })();
  }, []);

  // Start webcam when models ready
  useEffect(() => {
    if (loadState !== "ready") return;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setLoadState("no_cam"));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadState]);

  const raiseFlag = useCallback(
    (type: string) => {
      const now = Date.now();
      if ((cooldownRef.current[type] ?? 0) + FLAG_COOLDOWN > now) return;
      cooldownRef.current[type] = now;
      api("/api/exam/flag", {
        method: "POST",
        body: JSON.stringify({ rollNumber, type }),
      }).catch(() => {});
    },
    [rollNumber],
  );

  // Detection loop
  useEffect(() => {
    if (loadState !== "ready") return;

    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
          .withFaceLandmarks(true);

        if (detections.length === 0) {
          noFaceCount.current += 1;
          setFaceStatus("none");
          if (noFaceCount.current >= NO_FACE_THRESHOLD) raiseFlag("no_face");
        } else if (detections.length > 1) {
          noFaceCount.current = 0;
          setFaceStatus("multiple");
          raiseFlag("multiple_faces");
        } else {
          noFaceCount.current = 0;
          // Gaze estimation: nose tip offset from eye midpoint
          const pts = detections[0].landmarks.positions;
          const leftEyeOuter  = pts[36];
          const rightEyeOuter = pts[45];
          const noseTip        = pts[30];
          const eyeMidX  = (leftEyeOuter.x + rightEyeOuter.x) / 2;
          const eyeWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
          const asymmetry = eyeWidth > 0 ? Math.abs(noseTip.x - eyeMidX) / eyeWidth : 0;

          if (asymmetry > 0.35) {
            setFaceStatus("away");
            raiseFlag("face_away");
          } else {
            setFaceStatus("ok");
          }
        }
      } catch {
        // detection error — skip frame
      }
    }, DETECT_INTERVAL);

    return () => clearInterval(timer);
  }, [loadState, raiseFlag]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadState === "error") {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-navy-800 px-3 py-2 text-xs text-slate-400 shadow">
        <CameraOff size={12} /> Face proctoring unavailable
      </div>
    );
  }

  if (loadState === "no_cam") {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-navy-800 px-3 py-2 text-xs text-slate-400 shadow">
        <CameraOff size={12} /> Camera not available
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-navy-800 px-3 py-2 text-xs text-slate-400 shadow">
        <Camera size={12} className="animate-pulse" /> Loading face detection…
      </div>
    );
  }

  const sc = STATUS_CFG[faceStatus];

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-navy-700 bg-navy-900 px-3 py-1.5 shadow-lg"
        title="Expand proctoring"
      >
        <span className={`h-2 w-2 rounded-full ${sc.dot} animate-pulse`} />
        <Camera size={13} className="text-slate-400" />
        <ChevronUp size={12} className="text-slate-500" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 overflow-hidden rounded-xl border border-navy-700 bg-navy-900 shadow-xl">
      {/* header */}
      <div className="flex items-center justify-between bg-navy-800 px-2 py-1">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          <Camera size={10} /> Proctoring
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-slate-500 hover:text-slate-300"
          title="Collapse"
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {/* video */}
      <div className="relative">
        <video
          ref={videoRef}
          className="block h-[90px] w-[160px] object-cover"
          muted
          playsInline
        />
        {/* status bar */}
        <div className={`absolute bottom-0 left-0 right-0 px-2 py-0.5 text-[10px] font-semibold text-white ${sc.bar}`}>
          {sc.text}
        </div>
      </div>
    </div>
  );
}
