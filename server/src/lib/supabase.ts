import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env from current working dir or monorepo root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('[supabase] Missing env var: SUPABASE_URL');
}
if (!supabaseServiceKey) {
  throw new Error('[supabase] Missing env var: SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Service-role client — bypasses RLS. Only used server-side.
 * Never expose this client or its key to the browser.
 */
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
