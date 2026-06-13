import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
