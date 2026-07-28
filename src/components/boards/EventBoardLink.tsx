import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Columns3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureEventBoard } from "@/lib/boards.functions";
import { toast } from "sonner";

/** Opens (creating on first use) this event's speaker board. */
export function EventBoardLink({ eventId }: { eventId: string }) {
  const ensure = useServerFn(ensureEventBoard);
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => ensure({ data: { event_id: eventId } }),
    onSuccess: (b: any) => navigate({ to: "/boards/$boardId", params: { boardId: b.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open board"),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Columns3 className="h-3.5 w-3.5 mr-1.5" />
      )}
      Speaker board
    </Button>
  );
}
