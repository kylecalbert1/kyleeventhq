import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN}` } },
});

const original = JSON.parse(readFileSync("/tmp/original_speaker_values.json", "utf8"));

for (const o of original) {
  const { error } = await supabase
    .from("speakers")
    .update({
      last_message_direction: o.last_message_direction,
      last_message_at: o.last_message_at,
    })
    .eq("id", o.id);
  if (error) throw error;
}

console.log("Test data reverted for:", original.length, "speakers");
