import fs from 'fs';
import path from 'path';
import type { DiscoveryConfig, DiscoverySummary, Lead } from '@leads/shared';
import { supabase } from '../lib/supabase';
import { leadsService } from './leads.service';

// ─── Google Places API (New) Types ───────────────────────────────────────────

export interface GooglePlaceItem {
  id: string;
  displayName?: {
    text: string;
    languageCode?: string;
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  primaryTypeDisplayName?: {
    text: string;
    languageCode?: string;
  };
}

export interface GooglePlacesSearchResponse {
  places?: GooglePlaceItem[];
}

interface CachePayload {
  timestamp: string;
  category: string;
  area: string;
  rawResponse: GooglePlacesSearchResponse;
}

// ─── Cache & Helper Utilities ─────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCacheFilePath(category: string, area: string): string {
  const slugCategory = category.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  const slugArea = area.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  const cacheDir = path.resolve(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${slugCategory}_${slugArea}.json`);
}

function readFromCache(cachePath: string): GooglePlacesSearchResponse | null {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const payload: CachePayload = JSON.parse(raw);
    const age = Date.now() - new Date(payload.timestamp).getTime();
    if (age < THIRTY_DAYS_MS && payload.rawResponse) {
      return payload.rawResponse;
    }
  } catch {
    // Return null if invalid or corrupt cache
  }
  return null;
}

function writeToCache(cachePath: string, category: string, area: string, rawResponse: GooglePlacesSearchResponse): void {
  try {
    const payload: CachePayload = {
      timestamp: new Date().toISOString(),
      category,
      area,
      rawResponse,
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to write to cache file at ${cachePath}:`, err);
  }
}

// ─── Google Places Text Search API Request ────────────────────────────────────

async function fetchGooglePlacesTextSearch(
  query: string,
  apiKey: string
): Promise<GooglePlacesSearchResponse> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({
      textQuery: query,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Places API returned status ${response.status}: ${errText}`);
  }

  return (await response.json()) as GooglePlacesSearchResponse;
}

// ─── Main Discovery Function ──────────────────────────────────────────────────

export async function discoverLeads(configs: DiscoveryConfig[]): Promise<DiscoverySummary> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) {
    throw new Error('❌ Missing environment variable: GOOGLE_PLACES_API_KEY. Please configure GOOGLE_PLACES_API_KEY in .env.');
  }

  // Fetch existing place_ids from Supabase for deduplication
  const existingPlaceIds = await leadsService.getExistingPlaceIds();

  // Determine starting lead_number (format L####)
  let maxLeadNum = await leadsService.getMaxLeadNumber();
  if (maxLeadNum === 0) {
    maxLeadNum = 3999; // First lead will be L4000
  }

  let totalSearched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  const newLeadsToInsert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const { category, area } = config;
    const query = `${category} in ${area}`;
    const cachePath = getCacheFilePath(category, area);

    let placesResponse = readFromCache(cachePath);
    let isFromCache = false;

    if (placesResponse) {
      isFromCache = true;
    } else {
      if (i > 0) {
        await delay(DELAY_MS);
      }
      placesResponse = await fetchGooglePlacesTextSearch(query, apiKey);
      writeToCache(cachePath, category, area, placesResponse);
    }

    const places = placesResponse.places ?? [];
    let pairFound = places.length;
    let pairNew = 0;
    let pairDuplicates = 0;

    for (const place of places) {
      totalSearched++;

      if (!place.id || existingPlaceIds.has(place.id)) {
        pairDuplicates++;
        totalSkipped++;
        continue;
      }

      // Mark as seen so duplicates across pairs in the same run are skipped
      existingPlaceIds.add(place.id);
      pairNew++;

      maxLeadNum++;
      const lead_number = 'L' + String(maxLeadNum).padStart(4, '0');

      newLeadsToInsert.push({
        lead_number,
        business_name: place.displayName?.text || 'Unknown Business',
        category,
        city_area: area,
        phone: place.nationalPhoneNumber || null,
        has_website: Boolean(place.websiteUri),
        website_url: place.websiteUri || null,
        website_quality: 'unassessed',
        website_quality_notes: null,
        google_maps_link: place.googleMapsUri || null,
        google_rating: place.rating ?? null,
        review_count: place.userRatingCount != null ? String(place.userRatingCount) : null,
        place_id: place.id,
        lead_status: 'not_contacted',
        outreach_stage: null,
        notes: null,
        draft_message: null,
        date_found: new Date().toISOString(),
        last_contacted_at: null,
      });
    }

    const cacheLabel = isFromCache ? ' (from 30-day cache)' : '';
    console.log(
      `Searching ${category} in ${area}... ${pairFound} found, ${pairNew} new, ${pairDuplicates} duplicates${cacheLabel}`
    );
  }

  // Batch insert into Supabase in chunks of 20
  if (newLeadsToInsert.length > 0) {
    const BATCH_SIZE = 20;
    for (let j = 0; j < newLeadsToInsert.length; j += BATCH_SIZE) {
      const chunk = newLeadsToInsert.slice(j, j + BATCH_SIZE);
      const { error } = await supabase.from('leads').insert(chunk);
      if (error) {
        throw new Error(`Supabase batch insert error: ${error.message}`);
      }
      totalInserted += chunk.length;
    }
  }

  const summary: DiscoverySummary = {
    searched: totalSearched,
    newLeadsAdded: totalInserted,
    skippedDuplicates: totalSkipped,
  };

  return summary;
}
