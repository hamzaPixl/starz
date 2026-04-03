"use client";

import { Sparkles, LayoutGrid, MessageCircle, GitFork } from "lucide-react";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/graph/", label: "Graph", icon: GitFork },
  { href: "/chat/", label: "Chat", icon: MessageCircle },
];

export function NavHeader({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="shrink-0 flex items-center justify-between border-b border-border/50 px-6 h-12">
      <div className="flex items-center gap-4">
        <a href="/" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Starz</span>
        </a>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname === href.replace(/\/$/, "");
            return (
              <a
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
