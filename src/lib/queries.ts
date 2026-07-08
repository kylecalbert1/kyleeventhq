import { queryOptions } from "@tanstack/react-query";
import {
  listEvents,
  listEventSummaries,
  getEvent,
} from "@/lib/events.functions";
import { listSpeakers } from "@/lib/speakers.functions";
import { listSponsors } from "@/lib/sponsors.functions";
import { listWebsiteTasks } from "@/lib/website-tasks.functions";
import { listMilestones } from "@/lib/milestones.functions";

export const qk = {
  eventSummaries: () => ["eventSummaries"] as const,
  events: () => ["events"] as const,
  event: (id: string) => ["event", id] as const,
  speakers: (eventId?: string) => ["speakers", eventId ?? "all"] as const,
  sponsors: (eventId?: string) => ["sponsors", eventId ?? "all"] as const,
  websiteTasks: (eventId?: string) => ["websiteTasks", eventId ?? "all"] as const,
  milestones: (eventId?: string) => ["milestones", eventId ?? "all"] as const,
};

export const eventSummariesQuery = queryOptions({
  queryKey: qk.eventSummaries(),
  queryFn: () => listEventSummaries(),
});
export const eventsQuery = queryOptions({
  queryKey: qk.events(),
  queryFn: () => listEvents(),
});
export const eventQuery = (id: string) =>
  queryOptions({ queryKey: qk.event(id), queryFn: () => getEvent({ data: { id } }) });
export const speakersQuery = (eventId?: string) =>
  queryOptions({
    queryKey: qk.speakers(eventId),
    queryFn: () => listSpeakers({ data: eventId ? { event_id: eventId } : {} }),
  });
export const sponsorsQuery = (eventId?: string) =>
  queryOptions({
    queryKey: qk.sponsors(eventId),
    queryFn: () => listSponsors({ data: eventId ? { event_id: eventId } : {} }),
  });
export const websiteTasksQuery = (eventId?: string) =>
  queryOptions({
    queryKey: qk.websiteTasks(eventId),
    queryFn: () => listWebsiteTasks({ data: eventId ? { event_id: eventId } : {} }),
  });
export const milestonesQuery = (eventId?: string) =>
  queryOptions({
    queryKey: qk.milestones(eventId),
    queryFn: () => listMilestones({ data: eventId ? { event_id: eventId } : {} }),
  });
