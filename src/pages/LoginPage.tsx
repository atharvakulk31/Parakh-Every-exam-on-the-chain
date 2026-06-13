import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, homeFor } from "../lib/auth";

const PORTALS = {
  student: {
    title: "Student Portal",
    blurb: "Verify your paper's integrity and your exam assignment.",
    demo: "student1 / student123",
  },
  teacher: {
    title: "Staff Portal",
    blurb: "Question banking, paper assembly and evaluation.",
    demo: "teacher1 / teacher123",
  },
  admin: {
    title: "Admin Portal",
    blurb: "Full lifecycle control, distribution and audit trail.",
    demo: "admin1 / admin123",
  },
} as const;

export function LoginPage({ portal }: { portal: keyof typeof PORTALS }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = PORTALS[portal];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(username, password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold text-white">
            Para<span className="text-royal-400">kh</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Leak-proof exam lifecycle platform</p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-navy-900">{meta.title}</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">{meta.blurb}</p>

          {error && (
            <div className="mb-4 rounded-md border border-alert-500/30 bg-alert-100 px-3 py-2 text-sm text-alert-600">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-royal-500 focus:outline-none focus:ring-2 focus:ring-royal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-royal-500 focus:outline-none focus:ring-2 focus:ring-royal-100"
              />
            </div>
            <button
              disabled={busy}
              className="w-full rounded-md bg-royal-500 py-2.5 text-sm font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">Demo: {meta.demo}</p>
          <p className="mt-2 text-center text-xs text-slate-400">
            Locked out after 5 failed attempts (15 min)
          </p>
        </div>

        <div className="mt-4 flex justify-center gap-4 text-xs text-slate-400">
          <Link to="/login" className="hover:text-white">Student</Link>
          <Link to="/staff" className="hover:text-white">Staff</Link>
          <Link to="/admin" className="hover:text-white">Admin</Link>
        </div>
      </div>
    </div>
  );
}
