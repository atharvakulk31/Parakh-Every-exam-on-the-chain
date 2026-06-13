import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, ShieldAlert, Search, Wrench, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface VerifyResult {
  chainValid: boolean;
  brokenAt: number | null;
  found: boolean;
  assignment: { rollNumber: string; centerId: string; paperId: string; variant: string } | null;
  block: { index: number; timestamp: string; hash: string } | null;
}
interface ChainStatus {
  valid: boolean;
  length: number;
  brokenAt: number | null;
  blocks: { index: number; event: string; hash: string }[];
}

export function Verification() {
  const { user } = useAuth();
  const [roll, setRoll] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadChain = () => api<ChainStatus>("/api/verify").then(setChain).catch(() => {});
  useEffect(() => { loadChain(); }, []);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<VerifyResult>("/api/verify", { method: "POST", body: JSON.stringify({ rollNumber: roll }) });
      setResult(r);
      await loadChain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function tamper(restore: boolean) {
    setError(null);
    try {
      await api(`/api/verify/${restore ? "restore" : "tamper"}`, { method: "POST" });
      await loadChain();
      if (roll) {
        const r = await api<VerifyResult>("/api/verify", { method: "POST", body: JSON.stringify({ rollNumber: roll }) });
        setResult(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo action failed");
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 6 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Public Verification</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Enter your roll number to confirm your exam assignment is sealed on the SHA-256 hash chain.
        If anyone altered any record after the fact, every later hash breaks — and you see it.
      </p>

      {/* Chain status banner */}
      {chain && (
        <div className={`mt-4 flex items-center gap-3 rounded-lg border px-4 py-3 ${
          chain.valid ? "border-verified-500/40 bg-verified-100" : "border-alert-500/50 bg-alert-100"
        }`}>
          {chain.valid ? <ShieldCheck size={22} className="text-verified-600" /> : <ShieldAlert size={22} className="text-alert-600" />}
          <div className="text-sm">
            {chain.valid ? (
              <span className="font-semibold text-verified-600">Chain intact — {chain.length} blocks verified end to end.</span>
            ) : (
              <span className="font-semibold text-alert-600">
                TAMPERING DETECTED — hash mismatch at block #{chain.brokenAt}. All records after it are untrusted.
              </span>
            )}
          </div>
          {user?.role === "admin" && (
            <span className="ml-auto flex gap-2">
              <button onClick={() => tamper(false)}
                className="flex items-center gap-1 rounded-md border border-alert-500/50 px-2.5 py-1 text-xs font-medium text-alert-600 hover:bg-alert-100">
                <Wrench size={13} /> Simulate tampering
              </button>
              <button onClick={() => tamper(true)}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Undo2 size={13} /> Restore
              </button>
            </span>
          )}
        </div>
      )}

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <form onSubmit={lookup} className="flex gap-2">
            <input value={roll} onChange={(e) => setRoll(e.target.value.toUpperCase())}
              placeholder="Roll number, e.g. MH01-001" required
              className="flex-1 rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-royal-500 focus:outline-none focus:ring-2 focus:ring-royal-100" />
            <button disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-royal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50">
              <Search size={15} /> {busy ? "Checking…" : "Verify"}
            </button>
          </form>

          {result && (
            <div className={`mt-4 rounded-lg border-2 p-5 ${
              result.found && result.chainValid ? "border-verified-500 bg-verified-100/50"
              : result.found ? "border-alert-500 bg-alert-100/50"
              : "border-slate-300 bg-white"
            }`}>
              {!result.found ? (
                <div className="text-sm text-slate-600">
                  <span className="font-semibold">No assignment found.</span> Roll number not on the chain —
                  run Distribution first, or check the number (demo rolls: MH01-001 … KA01-003).
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {result.chainValid
                      ? <ShieldCheck size={20} className="text-verified-600" />
                      : <ShieldAlert size={20} className="text-alert-600" />}
                    <span className={`text-base font-bold ${result.chainValid ? "text-verified-600" : "text-alert-600"}`}>
                      {result.chainValid ? "VERIFIED — record authentic" : "RECORD FOUND, CHAIN BROKEN"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-slate-500">Roll number</dt><dd className="font-mono font-semibold text-navy-900">{result.assignment!.rollNumber}</dd>
                    <dt className="text-slate-500">Exam centre</dt><dd className="font-semibold text-navy-900">{result.assignment!.centerId}</dd>
                    <dt className="text-slate-500">Paper</dt><dd className="font-mono text-navy-900">{result.assignment!.paperId}</dd>
                    <dt className="text-slate-500">Variant</dt><dd className="font-semibold text-navy-900">{result.assignment!.variant}</dd>
                    <dt className="text-slate-500">Sealed at</dt><dd className="font-mono text-xs text-navy-900">{result.block?.timestamp.replace("T", " ").slice(0, 19)}</dd>
                    <dt className="text-slate-500">Block hash</dt>
                    <dd className="truncate font-mono text-xs text-navy-900" title={result.block?.hash}>{result.block?.hash.slice(0, 20)}…</dd>
                  </dl>
                  {!result.chainValid && (
                    <p className="mt-3 text-xs font-medium text-alert-600">
                      Hash chain broke at block #{result.brokenAt} — this record cannot be trusted until the
                      ledger is audited.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Chain explorer — block ledger */}
        <div className="rounded-lg border border-navy-700 bg-navy-950 p-5">
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
            <span>Hash chain ledger</span>
            <span className="rounded-full bg-navy-800 px-2.5 py-0.5 font-mono text-xs text-slate-300">{chain?.length ?? 0} blocks</span>
          </h2>
          <div className="relative max-h-80 overflow-y-auto pr-1">
            <span aria-hidden className="absolute bottom-2 left-[13px] top-2 w-px bg-navy-700" />
            <ol className="space-y-1.5">
              {chain?.blocks.map((b) => {
                const broken = !chain.valid && chain.brokenAt !== null && b.index >= chain.brokenAt;
                return (
                  <li key={b.index} className="relative flex items-center gap-3 pl-7">
                    <span aria-hidden
                      className={`absolute left-[9px] h-[9px] w-[9px] rounded-full border-2 ${
                        broken ? "border-alert-500 bg-alert-500/30" : "border-verified-500 bg-navy-950"
                      }`} />
                    <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] ${
                      broken ? "border-alert-500/50 bg-alert-500/10 text-alert-500" : "border-navy-800 bg-navy-900 text-slate-300"
                    }`}>
                      <span className="shrink-0 text-slate-500">#{String(b.index).padStart(2, "0")}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        broken ? "bg-alert-500/20" : "bg-navy-800 text-royal-400"
                      }`}>{b.event}</span>
                      <span className="truncate text-slate-500">{b.hash.slice(0, 16)}…</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
