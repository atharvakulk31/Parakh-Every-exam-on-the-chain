import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { session, login as apiLogin, logout as apiLogout, type SessionUser } from "./api";

interface AuthContextValue {
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(session.user);

  const login = async (username: string, password: string) => {
    const u = await apiLogin(username, password);
    setUser(u);
    return u;
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const LOGIN_ROUTE: Record<SessionUser["role"], string> = {
  student: "/login",
  teacher: "/staff",
  admin: "/admin",
};

export function homeFor(role: SessionUser["role"]): string {
  return role === "student" ? "/verification" : "/dashboard";
}

// Route guard: unauthenticated or wrong-role users are sent to their role's login page.
export function RequireRole({ roles, children }: { roles: SessionUser["role"][]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // No session — assume the least-privileged login for the area being accessed
    return <Navigate to={LOGIN_ROUTE[roles[0]]} state={{ from: location.pathname }} replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <>{children}</>;
}
