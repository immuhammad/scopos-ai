import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Target, Menu, X, LogOut } from "lucide-react";

const protectedLinks = [
  { to: "/command", label: "Dashboard" },
  { to: "/founders", label: "Founders" },
  { to: "/feed", label: "Sourcing" },
  { to: "/decisions", label: "Decisions" },
  { to: "/triage", label: "Triage" },
] as const;

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { signedIn, signOut } = useAuth();
  const thesisQ = useQuery({ queryKey: ["activeThesis"], queryFn: () => api.getActiveThesis(), enabled: signedIn });
  const t = thesisQ.data;
  const links = [...(signedIn ? protectedLinks : []), { to: "/apply", label: "Apply" } as const];
  const isActive = (to: string) => (to === "/founders" ? pathname.startsWith("/founders") : pathname === to);
  const doSignOut = () => {
    signOut();
    navigate({ to: "/" });
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background text-[11px] font-black">S</div>
          <span className="text-sm font-semibold tracking-tight">Scopos</span>
          <span className="ml-1 hidden rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground xl:inline">Operating System</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive(l.to)
                  ? "bg-surface-2 text-foreground"
                  : "text-muted-foreground hover:bg-surface-1 hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {signedIn && t && (
            <Link to="/command" className="hidden items-center gap-1.5 rounded-md border border-info/40 bg-info/10 px-2.5 py-1 text-info hover:bg-info/15 lg:inline-flex" title="Active thesis (click to open Dashboard)">
              <Target className="h-3 w-3" />
              <span className="font-medium text-foreground/90">Active thesis:</span>
              <span className="max-w-[220px] truncate">{t.name}</span>
            </Link>
          )}
          {signedIn ? (
            <button onClick={doSignOut}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          ) : (
            <Link to="/" className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-md border border-border md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border bg-background/95 px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
              className={cn("block rounded-md px-3 py-2 text-sm",
                isActive(l.to) ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
