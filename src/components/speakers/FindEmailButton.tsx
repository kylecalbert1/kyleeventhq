import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { findSpeakerEmail } from "@/lib/sync.functions";
import { updateSpeaker } from "@/lib/speakers.functions";

/**
 * One name-based Gmail sent-mail lookup for a speaker with no email on file.
 * Never saves silently — surfaces a single suggestion with a manual confirm.
 */
export function FindEmailButton({
  speakerId,
  name,
  className,
}: {
  speakerId: string;
  name: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [found, setFound] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const search = useMutation({
    mutationFn: () => findSpeakerEmail({ data: { name } }),
    onSuccess: (r: any) => {
      if (!r.connected) {
        toast.error("Gmail isn't connected.");
        return;
      }
      if (r.email) setFound(r.email);
      else toast.info("No sent email found for that name.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gmail search failed"),
  });

  const apply = useMutation({
    mutationFn: () => updateSpeaker({ data: { id: speakerId, patch: { email: found! } } }),
    onSuccess: () => {
      setDone(true);
      toast.success("Email saved");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save email"),
  });

  if (done) return null;

  return (
    <div className={className}>
      {found ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
          <span>
            Found <span className="font-medium text-slate-800">{found}</span> from a sent thread —
            use it?
          </span>
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              apply.mutate();
            }}
            disabled={apply.isPending}
          >
            {apply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use it"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-slate-500"
            onClick={(e) => {
              e.stopPropagation();
              setFound(null);
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            search.mutate();
          }}
          disabled={search.isPending}
        >
          {search.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
          )}
          Find email
        </Button>
      )}
    </div>
  );
}
