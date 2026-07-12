/**
 * PROFILE PAGE
 * ────────────
 * Paste your Profile component here.
 * Expected exports: `export default function Profile()`
 *
 * Route param: /profile/:username  → access via useParams()
 * This placeholder renders until you drop in your real file.
 */

import { User } from "lucide-react";

export default function Profile() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <User className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">User Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your <code className="text-xs bg-muted px-1 py-0.5 rounded">Profile.tsx</code> content here to replace this placeholder.
        </p>
      </div>
    </div>
  );
}
