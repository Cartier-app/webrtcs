// Supabase Edge Function for VoiceLink Signaling Management
// Deploy with: supabase functions deploy voicelink-signaling

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { action, data } = await req.json();

    switch (action) {
      case "create_signal":
        return await handleCreateSignal(supabaseClient, data);
      
      case "get_signals":
        return await handleGetSignals(supabaseClient, data);
      
      case "cleanup_signals":
        return await handleCleanupSignals(supabaseClient, data);
      
      case "update_call_status":
        return await handleUpdateCallStatus(supabaseClient, data);
      
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleCreateSignal(supabase: any, data: any) {
  const { call_id, sender_username, receiver_username, signal_type, signal_data } = data;

  const { data: signal, error } = await supabase
    .from("signaling")
    .insert({
      call_id,
      sender_username,
      receiver_username,
      signal_type,
      signal_data,
    })
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ data: signal }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleGetSignals(supabase: any, data: any) {
  const { call_id, receiver_username } = data;

  const { data: signals, error } = await supabase
    .from("signaling")
    .select("*")
    .eq("call_id", call_id)
    .eq("receiver_username", receiver_username)
    .order("created_at", { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ data: signals }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleCleanupSignals(supabase: any, data: any) {
  const { call_id } = data;

  const { error } = await supabase
    .from("signaling")
    .delete()
    .eq("call_id", call_id);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleUpdateCallStatus(supabase: any, data: any) {
  const { call_id, status, end_time, duration } = data;

  const updateData: any = { call_status: status };
  if (end_time) updateData.end_time = end_time;
  if (duration !== undefined) updateData.duration = duration;

  const { data: call, error } = await supabase
    .from("calls")
    .update(updateData)
    .eq("id", call_id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ data: call }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
