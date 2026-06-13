import { NavLink, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "../lib/auth";

// The 6-stage exam lifecycle — always visible, self-narrating for demo judges.
export const LIFECYCLE = [
  { stage: 1, label: "Question Bank", path: "/questions", roles: ["teacher", "admin"] },
  { stage: 2, label: "Paper Assembly", path: "/assembly", roles: ["teacher", "admin"] },
  { stage: 3, label: "Distribution", path: "/centers", roles: ["admin"] },
  { stage: 4, label: "Proctoring", path: "/proctoring", roles: ["teacher", "admin"] },
  { stage: 5, label: "Evaluation", path: "/evaluation", roles: ["teacher", "admin"] },
  { stage: 6, label: "Verification", path: "/verification", roles: ["student", "teacher", "admin"] },
] as const;

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const activeIdx = LIFECYCLE.findIndex((s) => location.pathname.startsWith(s.path));

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-navy-900 text-white">
      <div className="border-b border-navy-700 px-5 py-4">
        <div className="font-display text-xl font-bold tracking-tight">
          Para<span className="text-royal-400">kh</span>
        </div>
        <div className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-400">
          Leak-proof exam lifecycle
        </div>
      </div>

      <nav aria-label="Exam lifecycle navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {user?.role !== "student" && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `mb-4 block rounded-md px-3 py-2 text-sm font-medium ${
                isActive ? "bg-royal-500 text-white" : "text-slate-300 hover:bg-navy-800"
              }`
            }
          >
            Dashboard
          </NavLink>
        )}

        <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Lifecycle
        </div>
        <ol className="relative">
          {LIFECYCLE.map((s, i) => {
            const allowed = user ? (s.roles as readonly string[]).includes(user.role) : false;
            const isActive = i === activeIdx;
            // ✓ only for stages this role can actually reach and has passed
            const isDone = allowed && activeIdx >= 0 && i < activeIdx;
            return (
              <li key={s.stage} className="relative">
                {i < LIFECYCLE.length - 1 && (
                  <span
                    className={`absolute left-[22px] top-9 h-[calc(100%-20px)] w-px ${
                      isDone ? "bg-verified-500" : "bg-navy-700"
                    }`}
                  />
                )}
                {allowed ? (
                  <NavLink
                    to={s.path}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={`Stage ${s.stage}: ${s.label}`}
                    className={`relative z-10 mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      isActive
                        ? "bg-royal-500 font-semibold text-white"
                        : "text-slate-300 hover:bg-navy-800"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        isActive
                          ? "bg-white text-royal-600"
                          : isDone
                            ? "bg-verified-500 text-white"
                            : "bg-navy-700 text-slate-400"
                      }`}
                    >
                      {isDone ? "✓" : s.stage}
                    </span>
                    {s.label}
                  </NavLink>
                ) : (
                  <span
                    aria-label={`Stage ${s.stage}: ${s.label} (restricted for your role)`}
                    title="Restricted for your role"
                    className="relative z-10 mb-1 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-slate-500">
                      <Lock size={10} />
                    </span>
                    {s.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="border-t border-navy-700 px-5 py-4 text-sm">
        {user && (
          <>
            <div className="font-medium">{user.name}</div>
            <div className="mb-2 text-xs capitalize text-slate-400">{user.role}</div>
            <button
              onClick={logout}
              className="rounded-md bg-navy-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-navy-700"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
