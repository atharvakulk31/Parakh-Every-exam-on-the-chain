import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, RequireRole } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { QuestionBank } from "./pages/QuestionBank";
import { Assembly } from "./pages/Assembly";
import { Centers } from "./pages/Centers";
import { Proctoring } from "./pages/Proctoring";
import { Verification } from "./pages/Verification";
import { Evaluation } from "./pages/Evaluation";
import { ExamPage } from "./pages/ExamPage";
import { StudentResults } from "./pages/StudentResults";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* Role-specific login portals */}
          <Route path="/login" element={<LoginPage portal="student" />} />
          <Route path="/staff" element={<LoginPage portal="teacher" />} />
          <Route path="/admin" element={<LoginPage portal="admin" />} />

          {/* Protected app */}
          <Route element={<AppShell />}>
            <Route
              path="/dashboard"
              element={
                <RequireRole roles={["teacher", "admin"]}>
                  <Dashboard />
                </RequireRole>
              }
            />
            <Route
              path="/questions"
              element={
                <RequireRole roles={["teacher", "admin"]}>
                  <QuestionBank />
                </RequireRole>
              }
            />
            <Route
              path="/assembly"
              element={
                <RequireRole roles={["teacher", "admin"]}>
                  <Assembly />
                </RequireRole>
              }
            />
            <Route
              path="/centers"
              element={
                <RequireRole roles={["admin"]}>
                  <Centers />
                </RequireRole>
              }
            />
            <Route
              path="/proctoring"
              element={
                <RequireRole roles={["teacher", "admin"]}>
                  <Proctoring />
                </RequireRole>
              }
            />
            <Route
              path="/evaluation"
              element={
                <RequireRole roles={["teacher", "admin"]}>
                  <Evaluation />
                </RequireRole>
              }
            />
            <Route
              path="/exam"
              element={
                <RequireRole roles={["student"]}>
                  <ExamPage />
                </RequireRole>
              }
            />
            <Route
              path="/verification"
              element={
                <RequireRole roles={["student", "teacher", "admin"]}>
                  <Verification />
                </RequireRole>
              }
            />
            <Route
              path="/results"
              element={
                <RequireRole roles={["student"]}>
                  <StudentResults />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
