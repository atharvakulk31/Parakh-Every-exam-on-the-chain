import { useCallback, useEffect, useState } from "react";
import { FileText, EyeOff, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

interface Script {
  code: string;
  subject: string;
  paperId: string;
  variant: string;
  status: "pending" | "evaluated";
  marks: number | null;
}

export function Evaluation() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<{ scripts: Script[] }>("/api/evaluation/scripts")
      .then((r) => setScripts(r.scripts))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(code: string) {
    setError(null);
    try {
      await api(`/api/evaluation/scripts/${code}`, { method: "POST", body: JSON.stringify({ marks: Number(marks[code]) }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    }
  }

  const pending = scripts.filter((s) => s.status === "pending");
  const done = scripts.filter((s) => s.status === "evaluated");

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 5 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Anonymised Evaluation</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Evaluators see a script code — never a name, roll number, or centre. Identity is sealed until
        results publish, and every mark entered lands on the hash chain.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-royal-500/30 bg-royal-100 px-4 py-3 text-sm text-royal-600">
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
                    onClick={() => submit(s.code)}
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
