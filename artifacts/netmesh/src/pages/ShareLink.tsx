/**
 * SHARE LINK PAGE
 * ───────────────
 * Paste your ShareLink component here.
 * Expected exports: `export default function ShareLink()`
 *
 * This placeholder renders until you drop in your real file.
 */

import { Share2 } from "lucide-react";

export default function ShareLink() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Share2 className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Share a Link</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your <code className="text-xs bg-muted px-1 py-0.5 rounded">ShareLink.tsx</code> content here to replace this placeholder.
        </p>
      </div>
    </div>
  );
}
