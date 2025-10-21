// Supabase Edge Function: signaling relay (TypeScript)
import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";

serve(async (req) => {
  const { room_id, type, sdp, ice } = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  // Store signaling data
  await supabase.from("signaling").insert({
    room_id,
    type,
    sdp: type === "offer" || type === "answer" ? sdp : null,
    ice: type === "ice" ? ice : null
  });
  // Notify callee via real-time channel
  await supabase
    .channel(`signaling-${room_id}`)
    .send({ type, sdp, ice });
  return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
});