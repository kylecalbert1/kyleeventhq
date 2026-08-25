import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, Pencil, Trash2, Check, X, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eventLinkSectionsQuery } from "@/lib/queries";
import {
  createEventLinkSection,
  renameEventLinkSection,
  deleteEventLinkSection,
  upsertEventLink,
  deleteEventLink,
  type EventLinkSection,
} from "@/lib/event-links.functions";

export function EventLinksCard({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const q = useQuery(eventLinkSectionsQuery(eventId));
  const addSection = useServerFn(createEventLinkSection);
  const [newSection, setNewSection] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["eventLinkSections", eventId] });

  async function handleAddSection() {
    const name = newSection.trim();
    if (!name) return;
    await addSection({ data: { event_id: eventId, name } });
    setNewSection("");
    setAdding(false);
    refresh();
  }

  // Generated DB types don't cover the new tables yet, so widen here.
  const sections = (q.data ?? []) as unknown as EventLinkSection[];


  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Documents &amp; links
        </h2>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New section
          </Button>
        )}
      </div>

      {adding && (
        <Card className="surface-card rounded-2xl p-3 flex items-center gap-2">
          <Input
            autoFocus
            className="h-9"
            placeholder="Section name, e.g. Contracts"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
          />
          <Button size="sm" onClick={handleAddSection} disabled={!newSection.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setNewSection("");
            }}
          >
            Cancel
          </Button>
        </Card>
      )}

      {q.isLoading ? (
        <Card className="surface-card rounded-2xl p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : sections.length === 0 ? (
        <Card className="surface-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No link sections yet. Create one to store contracts, sponsor decks, run of show and
          anything else for this event.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((s) => (
            <SectionCard key={s.id} section={s} onChanged={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionCard({
  section,
  onChanged,
}: {
  section: EventLinkSection;
  onChanged: () => void;
}) {
  const rename = useServerFn(renameEventLinkSection);
  const removeSection = useServerFn(deleteEventLinkSection);
  const saveLink = useServerFn(upsertEventLink);
  const removeLink = useServerFn(deleteEventLink);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(section.name);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; url: string }>({ label: "", url: "" });
  const [addingLink, setAddingLink] = useState(false);

  async function commitName() {
    const n = name.trim();
    setEditingName(false);
    if (!n || n === section.name) {
      setName(section.name);
      return;
    }
    await rename({ data: { id: section.id, name: n } });
    onChanged();
  }

  async function commitLink() {
    if (!draft.label.trim() || !draft.url.trim()) return;
    await saveLink({
      data: {
        id: editingLinkId,
        section_id: section.id,
        label: draft.label.trim(),
        url: draft.url.trim(),
      },
    });
    setDraft({ label: "", url: "" });
    setEditingLinkId(null);
    setAddingLink(false);
    onChanged();
  }

  return (
    <Card className="surface-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <div className="flex items-center gap-1.5 flex-1">
            <Input
              autoFocus
              className="h-8"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setName(section.name);
                  setEditingName(false);
                }
              }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commitName}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">{section.name}</span>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Rename section"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="Delete section"
          className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            if (!confirm(`Delete "${section.name}" and its links?`)) return;
            await removeSection({ data: { id: section.id } });
            onChanged();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="space-y-1">
        {section.event_links.length === 0 && !addingLink && (
          <li className="text-xs text-muted-foreground">No links yet.</li>
        )}
        {section.event_links.map((l) =>
          editingLinkId === l.id ? (
            <li key={l.id} className="space-y-1.5 rounded-lg bg-muted/40 p-2">
              <Input
                className="h-8"
                value={draft.label}
                placeholder="Label"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
              <Input
                className="h-8"
                value={draft.url}
                placeholder="https://…"
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7" onClick={commitLink}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setEditingLinkId(null)}
                >
                  Cancel
                </Button>
              </div>
            </li>
          ) : (
            <li key={l.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-sm text-sky-700 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{l.label}</span>
              </a>
              <button
                type="button"
                aria-label="Edit link"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditingLinkId(l.id);
                  setAddingLink(false);
                  setDraft({ label: l.label, url: l.url });
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Delete link"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await removeLink({ data: { id: l.id } });
                  onChanged();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ),
        )}
      </ul>

      {addingLink ? (
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-2">
          <Input
            autoFocus
            className="h-8"
            placeholder="Label, e.g. Signed contract"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <Input
            className="h-8"
            placeholder="https://…"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && commitLink()}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7"
              onClick={commitLink}
              disabled={!draft.label.trim() || !draft.url.trim()}
            >
              Add link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setAddingLink(false);
                setDraft({ label: "", url: "" });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setAddingLink(true);
            setEditingLinkId(null);
            setDraft({ label: "", url: "" });
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add link
        </Button>
      )}
    </Card>
  );
}
