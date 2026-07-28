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
import { listWeeklyPriorities } from "@/lib/weekly-priorities.functions";
import { listMyPriorities, listPrioritiesForEvent } from "@/lib/priorities.functions";
import { listAsanaTasks, getOverdueWebsiteAsanaCount } from "@/lib/asana-tasks.functions";
import { listOutreachAccounts, listTeamChecklist } from "@/lib/outreach.functions";
import { listEmailSends } from "@/lib/email-sends.functions";
import { getEventOutreach } from "@/lib/outreach-hub.functions";
import { listAgendaItems, listAgendaTemplates } from "@/lib/agenda.functions";
import { listEventReleases, getEventReconciliation, getEventTitoLinks, listTitoEventsForPicker } from "@/lib/tito.functions";
import { listEmailTemplates } from "@/lib/email-templates.functions";
import { listPastSpeakers } from "@/lib/directory.functions";
import { getUserSettings } from "@/lib/user-settings.functions";
import { listBoards, getBoard } from "@/lib/boards.functions";

export const userSettingsQuery = queryOptions({
  queryKey: ["userSettings"],
  queryFn: () => getUserSettings(),
});

export const qk = {
  eventSummaries: () => ["eventSummaries"] as const,
  events: () => ["events"] as const,
  event: (id: string) => ["event", id] as const,
  speakers: (eventId?: string) => ["speakers", eventId ?? "all"] as const,
  sponsors: (eventId?: string) => ["sponsors", eventId ?? "all"] as const,
  websiteTasks: (eventId?: string) => ["websiteTasks", eventId ?? "all"] as const,
  milestones: (eventId?: string) => ["milestones", eventId ?? "all"] as const,
  weeklyPriorities: (week: string) => ["weeklyPriorities", week] as const,
  outreachAccounts: (week: string) => ["outreachAccounts", week] as const,
  teamChecklist: (week: string) => ["teamChecklist", week] as const,
  emailSends: (eventId?: string) => ["emailSends", eventId ?? "all"] as const,
  emailTemplates: () => ["emailTemplates"] as const,
  eventOutreach: (eventId: string) => ["eventOutreach", eventId] as const,
  agendaItems: (eventId: string) => ["agendaItems", eventId] as const,
  agendaTemplates: () => ["agendaTemplates"] as const,
  pastSpeakers: (includeAttendees: boolean) => ["pastSpeakers", includeAttendees] as const,
};

export const eventOutreachQuery = (eventId: string) =>
  queryOptions({
    queryKey: qk.eventOutreach(eventId),
    queryFn: () => getEventOutreach({ data: { event_id: eventId } }),
  });
export const agendaItemsQuery = (eventId: string) =>
  queryOptions({
    queryKey: qk.agendaItems(eventId),
    queryFn: () => listAgendaItems({ data: { event_id: eventId } }),
  });
export const agendaTemplatesQuery = queryOptions({
  queryKey: qk.agendaTemplates(),
  queryFn: () => listAgendaTemplates(),
});

export const emailSendsQuery = (eventId?: string) =>
  queryOptions({
    queryKey: qk.emailSends(eventId),
    queryFn: () => listEmailSends({ data: eventId ? { event_id: eventId } : {} }),
  });

export const emailTemplatesQuery = queryOptions({
  queryKey: qk.emailTemplates(),
  queryFn: () => listEmailTemplates(),
  staleTime: 30_000,
});

export const pastSpeakersQuery = (includeAttendees: boolean) =>
  queryOptions({
    queryKey: qk.pastSpeakers(includeAttendees),
    queryFn: () => listPastSpeakers({ data: { include_attendees: includeAttendees } }),
    staleTime: 60_000,
  });

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
export const weeklyPrioritiesQuery = (week: string) =>
  queryOptions({
    queryKey: qk.weeklyPriorities(week),
    queryFn: () => listWeeklyPriorities({ data: { week_start: week } }),
  });
export const outreachAccountsQuery = (week: string) =>
  queryOptions({
    queryKey: qk.outreachAccounts(week),
    queryFn: () => listOutreachAccounts({ data: { week_start: week } }),
  });
export const teamChecklistQuery = (week: string) =>
  queryOptions({
    queryKey: qk.teamChecklist(week),
    queryFn: () => listTeamChecklist({ data: { week_start: week } }),
  });

export const eventReleasesQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["eventReleases", eventId],
    queryFn: () => listEventReleases({ data: { event_id: eventId } }),
  });

export const eventReconciliationQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["eventReconciliation", eventId],
    queryFn: () => getEventReconciliation({ data: { event_id: eventId } }),
  });

export const eventTitoLinksQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["eventTitoLinks", eventId],
    queryFn: () => getEventTitoLinks({ data: { event_id: eventId } }),
  });

export const titoEventsPickerQuery = queryOptions({
  queryKey: ["titoEventsPicker"],
  queryFn: () => listTitoEventsForPicker(),
});

export const myPrioritiesQuery = queryOptions({
  queryKey: ["myPriorities"],
  queryFn: () => listMyPriorities(),
});

export const eventPrioritiesQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["eventPriorities", eventId],
    queryFn: () => listPrioritiesForEvent({ data: { event_id: eventId } }),
  });

export const asanaTasksQuery = (params: { event_id?: string | null; website_only?: boolean; hide_completed?: boolean } = {}) =>
  queryOptions({
    queryKey: ["asanaTasks", params],
    queryFn: () => listAsanaTasks({ data: params }),
  });

export const overdueWebsiteAsanaQuery = queryOptions({
  queryKey: ["overdueWebsiteAsana"],
  queryFn: () => getOverdueWebsiteAsanaCount(),
  refetchInterval: 5 * 60_000,
});

/* ---------------- speaker boards ---------------- */

export const boardsQuery = queryOptions({
  queryKey: ["speakerBoards"],
  queryFn: () => listBoards(),
});

export const boardQuery = (boardId: string) =>
  queryOptions({
    queryKey: ["speakerBoard", boardId],
    queryFn: () => getBoard({ data: { board_id: boardId } }),
  });
