// Placeholder for lifecycle screens built in Phases 3–5.
export function StagePage({ stage, title, blurb }: { stage: number; title: string; blurb: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">
        Stage {stage} of 6
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-500">{blurb}</p>
      <div className="mt-8 rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
        Screen under construction — backing API is live.
      </div>
    </div>
  );
}
