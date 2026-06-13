import { useEffect, useState, type FormEvent } from "react";
import { Lock, CheckCircle2, Clock } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Question {
  id: string;
  subject: string;
  topic: string;
  language: string;
  status: "pending" | "approved";
  text: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  createdBy: string;
  createdAt: string;
  integrity: boolean;
}

const DIFF_BADGE = {
  easy: "bg-verified-100 text-verified-600",
  medium: "bg-pending-100 text-pending-500",
  hard: "bg-alert-100 text-alert-600",
};

export function QuestionBank() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");

  const [form, setForm] = useState({
    subject: "Physics",
    topic: "",
    language: "English",
    text: "",
    marks: 3,
    difficulty: "medium" as Question["difficulty"],
  });

  const load = () =>
    api<{ questions: Question[] }>("/api/questions")
      .then((r) => setQuestions(r.questions))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/questions", { method: "POST", body: JSON.stringify(form) });
      setNotice("Question encrypted and stored — pending peer approval.");
      setForm((f) => ({ ...f, topic: "", text: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setError(null);
    try {
      await api(`/api/questions/${id}/approve`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  const visible = questions.filter((q) => filter === "all" || q.status === filter);
  const pendingCount = questions.filter((q) => q.status === "pending").length;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-royal-500">Stage 1 of 6</div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">Question Bank</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Human experts author questions in-app. Each question is AES-256-GCM encrypted the moment it is
        submitted, and approval requires a second reviewer — no single person controls the bank.
      </p>

      {error && <div className="mt-4 rounded-md border border-alert-500/30 bg-alert-100 px-4 py-2 text-sm text-alert-600">{error}</div>}
      {notice && <div className="mt-4 rounded-md border border-verified-500/30 bg-verified-100 px-4 py-2 text-sm text-verified-600">{notice}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Author form */}
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 xl:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900">
            <Lock size={16} className="text-royal-500" /> Author a question
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Subject
              <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                <option>Physics</option><option>Mathematics</option><option>Chemistry</option><option>Biology</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Topic
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="e.g. Thermodynamics" required
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Difficulty
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Question["difficulty"] })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Marks
              <input type="number" min={1} max={10} value={form.marks}
                onChange={(e) => setForm({ ...form, marks: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600">
              Source language
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                <option>English</option><option>Hindi</option><option>Marathi</option>
              </select>
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600">
              Question text
              <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
                required rows={4} placeholder="Plaintext never touches disk — encrypted on submit."
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
            </label>
          </div>
          <button disabled={busy}
            className="mt-4 w-full rounded-md bg-royal-500 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50">
            {busy ? "Encrypting…" : "Encrypt & submit"}
          </button>
        </form>

        {/* Bank list */}
        <div className="xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900">
              Bank ({questions.length}) {pendingCount > 0 && <span className="text-pending-500">— {pendingCount} pending</span>}
            </h2>
            <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-1 text-xs">
              {(["all", "pending", "approved"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded px-2.5 py-1 capitalize ${filter === f ? "bg-royal-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {visible.map((q) => (
              <div key={q.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-navy-900">{q.id}</span>
                  <span className="rounded-full bg-royal-100 px-2 py-0.5 text-royal-600">{q.subject}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{q.topic}</span>
                  <span className={`rounded-full px-2 py-0.5 capitalize ${DIFF_BADGE[q.difficulty]}`}>{q.difficulty}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{q.language}</span>
                  <span className="text-slate-500">{q.marks} marks</span>
                  <span className="ml-auto flex items-center gap-1">
                    {q.status === "approved" ? (
                      <span className="flex items-center gap-1 text-verified-600"><CheckCircle2 size={14} /> Approved</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-pending-500"><Clock size={14} /> Pending</span>
                        {user && q.createdBy !== user.id && (
                          <button onClick={() => approve(q.id)}
                            className="ml-2 rounded-md bg-verified-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-verified-600">
                            Approve
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{q.text}</p>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No questions match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
