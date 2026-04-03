"use client";

import { Sparkles, LayoutGrid, MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/chat/", label: "Chat", icon: MessageCircle },
];

export function NavHeader({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="shrink-0 flex items-center justify-between border-b border-border/30 px-6 h-12 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-bold tracking-tight">Starz</span>
        </Link>
        <div className="h-4 w-px bg-border/30" />
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname === href.replace(/\/$/, "");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary/12 text-primary shadow-sm shadow-primary/5"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </header>
  );
}
