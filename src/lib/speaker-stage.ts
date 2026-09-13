export type SpeakerStageRecord = {
  id: string;
  status?: string | null;
  call_scheduled?: boolean | null;
};

export const speakerStageChipTones = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  sky: "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100",
} as const;

export const speakerStageChipActiveTones = {
  emerald: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600",
  sky: "bg-sky-600 text-white border-sky-600 hover:bg-sky-600",
  violet: "bg-violet-600 text-white border-violet-600 hover:bg-violet-600",
  amber: "bg-amber-600 text-white border-amber-600 hover:bg-amber-600",
} as const;

export type SpeakerStageTone = keyof typeof speakerStageChipTones;

export function isProspectiveSpeaker(speaker: SpeakerStageRecord): boolean {
  return (speaker.status === "new" || speaker.status === "contacted") && !speaker.call_scheduled;
}

export function isSpeakerInConversation(speaker: SpeakerStageRecord): boolean {
  return (
    speaker.status === "in_conversation" ||
    (Boolean(speaker.call_scheduled) &&
      speaker.status !== "confirmed" &&
      speaker.status !== "declined")
  );
}

export function isRespondedSpeaker(speaker: SpeakerStageRecord): boolean {
  return speaker.status === "responded";
}

export function getCoreSpeakerStageCounts(speakers: SpeakerStageRecord[]) {
  return {
    confirmed: speakers.filter((speaker) => speaker.status === "confirmed").length,
    prospective: speakers.filter(isProspectiveSpeaker).length,
    inConversation: speakers.filter(isSpeakerInConversation).length,
    responded: speakers.filter(isRespondedSpeaker).length,
  };
}