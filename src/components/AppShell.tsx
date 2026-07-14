import { Link, Outlet, useRouter } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Globe,
  CalendarDays,
  LogOut,
  Target,
  ClipboardCheck,
  Inbox,
  Reply,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; exact?: boolean };

const NAV_PRIMARY: NavItem[] = [
  { to: "/", label: "Events", icon: LayoutGrid, exact: true },
  { to: "/speakers", label: "Speakers", icon: Users },
  { to: "/website", label: "Website", icon: Globe },
];

const NAV_OPS: NavItem[] = [
  { to: "/milestones", label: "Kickoff & Washup", icon: CalendarDays },
  { to: "/outreach", label: "Weekly Outreach", icon: Target },
  { to: "/tito", label: "Tito Events", icon: CalendarDays },
  { to: "/speaker-sourcing", label: "Speaker Sourcing", icon: Search },
  { to: "/reply-needed", label: "Reply Needed", icon: Reply },
  { to: "/proofing", label: "Proofing", icon: ClipboardCheck },
  { to: "/sponsor-inbox", label: "Sponsor Inbox", icon: Inbox },
];

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to as never}
      activeOptions={{ exact: item.exact ?? false }}
      className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      activeProps={{
        className:
          "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary shadow-sm",
      }}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden md:flex md:w-60 flex-col border-r bg-background">
        <div className="flex h-16 items-center px-5 border-b">
          <div className="text-sm font-semibold tracking-tight leading-tight">
            Event Ops
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Command Center
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Event delivery
          </div>
          <div className="space-y-0.5">
            {NAV_PRIMARY.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Ops & outreach
          </div>
          <div className="space-y-0.5">
            {NAV_OPS.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children ?? <Outlet />}</main>
    </div>
  );
}
