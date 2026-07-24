import { supabase } from '../lib/supabase';
import type { Lead, UpdateLeadInput } from '@leads/shared';

interface ListOptions {
  page: number;
  limit: number;
}

interface ListResult {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
}

export const leadsService = {
  async list({ page, limit }: ListOptions): Promise<ListResult> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      leads: (data ?? []) as Lead[],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getById(id: string): Promise<Lead | null> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as Lead;
  },

  async upsertByPlaceId(input: Omit<Lead, 'id' | 'lead_number' | 'created_at' | 'updated_at'>): Promise<Lead> {
    const { data, error } = await supabase
      .from('leads')
      .upsert(input, { onConflict: 'place_id', ignoreDuplicates: true })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Lead;
  },

  async update(id: string, patch: UpdateLeadInput): Promise<Lead> {
    const { data, error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Lead;
  },

  /** Returns the set of existing place_ids — used for deduplication during discovery */
  async getExistingPlaceIds(): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('leads')
      .select('place_id')
      .not('place_id', 'is', null);

    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((r: { place_id: string | null }) => r.place_id!).filter(Boolean));
  },

  /** Finds the maximum integer from lead_number (e.g. "L4045" -> 4045) */
  async getMaxLeadNumber(): Promise<number> {
    const { data, error } = await supabase
      .from('leads')
      .select('lead_number')
      .not('lead_number', 'is', null);

    if (error) throw new Error(error.message);

    let maxNum = 0;
    for (const row of data ?? []) {
      if (row.lead_number && typeof row.lead_number === 'string') {
        const match = row.lead_number.match(/L?(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
    return maxNum;
  },

  /** Queries leads with has_website = true and website_quality = 'unassessed' */
  async getUnassessedWebLeads(limit = 5): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('has_website', true)
      .eq('website_quality', 'unassessed')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as Lead[];
  },

  /** Queries total count of leads with has_website = true and website_quality = 'unassessed' */
  async getUnassessedWebLeadsCount(): Promise<number> {
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('has_website', true)
      .eq('website_quality', 'unassessed');

    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};
