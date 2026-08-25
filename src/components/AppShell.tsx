import { Link, Outlet, useRouter } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Globe,
  LogOut,
  Inbox,
  Reply,
  Mail,
  ListChecks,
  Megaphone,
  Sparkles,
  Ticket,
  Settings as SettingsIcon,
  Columns3,
  Wand2,
  MessageSquareText,

} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; exact?: boolean };

const NAV_PRIMARY: NavItem[] = [
  { to: "/", label: "Events", icon: LayoutGrid, exact: true },
  { to: "/tito", label: "All Tito events", icon: Ticket },
  // Speakers live on their event page. This entry is the secondary,
  // cross-event sourcing/re-recruitment view only.
  { to: "/speakers", label: "Find speakers", icon: Users },

  { to: "/boards", label: "Speaker boards", icon: Columns3 },
  { to: "/agenda", label: "Agenda", icon: ListChecks },
  { to: "/outreach", label: "Outreach", icon: Megaphone },
  // ARCHIVED (re-add to restore):
  // { to: "/website", label: "Website", icon: Globe },
  // { to: "/reply-needed", label: "Reply needed", icon: Reply },
  { to: "/message-templates", label: "Message templates", icon: MessageSquareText },
  { to: "/sent-messages", label: "Sent messages", icon: Mail },
];


const NAV_OPS: NavItem[] = [
  { to: "/asana", label: "Asana", icon: Sparkles },
  { to: "/sponsor-inbox", label: "Sponsor inbox", icon: Inbox },
  { to: "/tools/logo-converter", label: "Logo converter", icon: Wand2 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];


function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to as never}
      activeOptions={{ exact: item.exact ?? false }}
      className="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{
        className:
          "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      }}
    >
      <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
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
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex md:w-56 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center px-4 border-b border-border">
          <div className="text-[13px] font-semibold leading-tight text-foreground">
            Event Ops
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Command centre
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Delivery
          </div>
          <div className="space-y-0.5">
            {NAV_PRIMARY.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Ops
          </div>
          <div className="space-y-0.5">
            {NAV_OPS.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
        <div className="p-2 border-t border-border">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children ?? <Outlet />}</main>
    </div>
  );
}
