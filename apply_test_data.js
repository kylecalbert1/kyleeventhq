import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN}` } },
});

const now = new Date();
const testSpeakers = {
  "458773ae-3c9d-417e-92cb-2ba51b6d3ee4": {
    name: "Deepak Sharma",
    test: "reply_needed",
    last_message_direction: "inbound",
    last_message_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  "3c504c9f-83be-46e3-ba07-e0f9f577629f": {
    name: "Carolina Nemi",
    test: "follow_up",
    last_message_direction: "outbound",
    last_message_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  "bd9314f0-292d-4991-aeeb-9a99b390a83b": {
    name: "Erika Cowen",
    test: "no_badge",
    last_message_direction: "inbound",
    last_message_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

const { data: original, error } = await supabase
  .from("speakers")
  .select("id,last_message_at,last_message_direction")
  .in("id", Object.keys(testSpeakers));
if (error) throw error;

writeFileSync("/tmp/original_speaker_values.json", JSON.stringify(original, null, 2));

for (const [id, cfg] of Object.entries(testSpeakers)) {
  const { error } = await supabase
    .from("speakers")
    .update({
      last_message_direction: cfg.last_message_direction,
      last_message_at: cfg.last_message_at,
    })
    .eq("id", id);
  if (error) throw error;
}

console.log("Test data applied for:", Object.values(testSpeakers).map((s) => s.name).join(", "));
