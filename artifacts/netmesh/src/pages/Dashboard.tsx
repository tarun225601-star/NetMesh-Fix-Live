/**
 * DASHBOARD PAGE
 * ──────────────
 * Paste your Dashboard component here.
 * Expected exports: `export default function Dashboard()`
 *
 * This placeholder renders until you drop in your real file.
 */

import { LayoutDashboard } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <LayoutDashboard className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your <code className="text-xs bg-muted px-1 py-0.5 rounded">Dashboard.tsx</code> content here to replace this placeholder.
        </p>
      </div>
    </div>
  );
}
