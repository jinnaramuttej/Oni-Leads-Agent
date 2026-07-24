// ─── Enums ────────────────────────────────────────────────────────────────────

export type WebsiteQuality =
  | 'good'
  | 'average'
  | 'poor'
  | 'broken'
  | 'unassessed';

export type LeadStatus =
  | 'not_contacted'
  | 'contacted'
  | 'interested'
  | 'dead'
  | 'converted';

// ─── Core Lead ────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;                          // uuid – Supabase PK
  lead_number: string;                 // "L4000", "L4001", …
  business_name: string;
  category: string;
  city_area: string;
  phone: string | null;
  has_website: boolean;
  website_url: string | null;
  website_quality: WebsiteQuality;
  website_quality_notes: string | null;
  google_maps_link: string | null;
  google_rating: number | null;
  review_count: string | null;
  place_id: string | null;               // Google Places ID — dedupe key (nullable for legacy leads)
  lead_status: LeadStatus;
  outreach_stage: string | null;
  notes: string | null;
  draft_message: string | null;
  date_found: string;                  // ISO timestamp
  last_contacted_at: string | null;   // ISO timestamp
  created_at: string;
  updated_at: string;
}

// ─── Insert / Update DTOs ─────────────────────────────────────────────────────

export type CreateLeadInput = Omit<
  Lead,
  'id' | 'lead_number' | 'created_at' | 'updated_at'
>;

export type UpdateLeadInput = Partial<
  Omit<Lead, 'id' | 'lead_number' | 'place_id' | 'created_at' | 'updated_at'>
>;

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Discovery ────────────────────────────────────────────────────────────────

export interface DiscoveryConfig {
  category: string;
  area: string;
}

export interface DiscoverySummary {
  searched: number;
  newLeadsAdded: number;
  skippedDuplicates: number;
}
