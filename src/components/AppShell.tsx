import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { LayoutGrid, Users, Image as ImageIcon, Globe, CalendarDays, LogOut, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";


const NAV: { to: string; label: string; icon: typeof LayoutGrid; exact?: boolean }[] = [
  { to: "/", label: "Events", icon: LayoutGrid, exact: true },
  { to: "/speakers", label: "Speakers", icon: Users },
  { to: "/banners", label: "Banners", icon: ImageIcon },
  { to: "/website", label: "Website", icon: Globe },
  { to: "/milestones", label: "Kickoff & Washup", icon: CalendarDays },
  { to: "/outreach", label: "Weekly Outreach", icon: Target },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden md:flex md:w-60 flex-col border-r bg-background">
        <div className="flex h-16 items-center px-6 border-b">
          <div className="text-sm font-semibold tracking-tight leading-tight">
            Event Ops
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Command Center
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              activeProps={{ className: "bg-accent text-foreground font-medium" }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
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
