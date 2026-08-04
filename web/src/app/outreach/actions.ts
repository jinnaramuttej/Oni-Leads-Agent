"use server";

import { createClient } from "@supabase/supabase-js";

// Initialize server-side Supabase client with auth disabled
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

export async function fetchNextLeadAction(skipIds: string[] = []) {
  try {
    // 1. Fetch remaining count
    const { count, error: countError } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("lead_status", "draft_ready")
      .not("wa_link", "is", null)
      .not("wa_link", "like", "%wa.me/91?text%");

    if (countError) throw countError;

    if (count === 0) {
      return { lead: null, remaining: 0 };
    }

    // 2. Fetch one lead
    let query = supabase
      .from("leads")
      .select("*")
      .eq("lead_status", "draft_ready")
      .not("wa_link", "is", null)
      .not("wa_link", "like", "%wa.me/91?text%")
      .order("business_name", { ascending: true })
      .limit(1);

    if (skipIds.length > 0) {
      query = query.not("id", "in", `(${skipIds.join(",")})`);
    }

    const { data, error: leadError } = await query;
    if (leadError) throw leadError;

    return { lead: data && data.length > 0 ? data[0] : null, remaining: count };
  } catch (err: any) {
    console.error(err);
    throw new Error(err.message || "Failed to fetch lead data");
  }
}

export async function updateLeadStatusAction(id: string, status: string) {
  try {
    let payload: any = { lead_status: status };

    // Map custom UI statuses to standard DB enum values
    if (status === "invalid_number") {
      payload.lead_status = "dead";
      payload.outreach_stage = "Invalid Number";
    } else if (status === "not_interested") {
      payload.lead_status = "dead";
      payload.outreach_stage = "Not Interested";
    }

    const { error } = await supabase
      .from("leads")
      .update(payload)
      .eq("id", id);
      
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error(err);
    throw new Error(err.message || "Failed to update lead");
  }
}
