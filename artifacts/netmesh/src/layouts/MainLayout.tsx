import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Share2,
  Link2,
  User,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/share", label: "Share Link", icon: Share2 },
  { href: "/links", label: "My Links", icon: Link2 },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();

  return (
    <nav className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center justify-between px-6 h-16 border-b border-sidebar-border shrink-0">
        <span className="font-semibold tracking-tight text-sm">NetMesh</span>
      </div>
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium",
              location === href ? "bg-sidebar-accent" : ""
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen bg-background">
      <div className="hidden lg:flex w-56 flex-col"><Sidebar /></div>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
