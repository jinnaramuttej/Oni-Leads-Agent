import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@leads/shared';

export const metadata: Metadata = {
  title: 'Leads — Oni Agent',
  description: 'All discovered local business leads',
};

// Status badge colours
const STATUS_STYLES: Record<string, string> = {
  not_contacted: 'bg-gray-700 text-gray-300',
  contacted:     'bg-blue-900/60 text-blue-300',
  interested:    'bg-green-900/60 text-green-300',
  dead:          'bg-red-900/60 text-red-300',
  converted:     'bg-purple-900/60 text-purple-300',
};

const STATUS_LABELS: Record<string, string> = {
  not_contacted: 'Not Contacted',
  contacted:     'Contacted',
  interested:    'Interested',
  dead:          'Dead',
  converted:     'Converted',
};

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  const leads = (data ?? []) as Lead[];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-gray-400 mt-1">
            {error
              ? 'Failed to load leads — check Supabase env vars'
              : `${count ?? 0} total leads`}
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          <strong>Supabase error:</strong> {error.message}
        </div>
      )}

      {/* Empty state */}
      {!error && leads.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 px-8 py-16 text-center">
          <p className="text-gray-400 text-sm">No leads yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Run the discovery job to populate this table.
          </p>
        </div>
      )}

      {/* Table */}
      {leads.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 font-medium">Maps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="bg-gray-900/50 hover:bg-gray-800/60 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs whitespace-nowrap">
                    {lead.lead_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-white whitespace-nowrap max-w-[200px] truncate">
                    {lead.business_name}
                  </td>
                  <td className="px-4 py-3 text-gray-400 capitalize">
                    {lead.category}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {lead.city_area}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {lead.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {lead.google_rating != null ? (
                      <span>
                        ⭐ {lead.google_rating}
                        <span className="text-gray-600 text-xs ml-1">
                          ({lead.review_count ?? '0'})
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_STYLES[lead.lead_status] ?? STATUS_STYLES.not_contacted
                      }`}
                    >
                      {STATUS_LABELS[lead.lead_status] ?? lead.lead_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {lead.website_url ? (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:underline text-xs"
                      >
                        Visit ↗
                      </a>
                    ) : (
                      <span className="text-gray-600 text-xs">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {lead.google_maps_link ? (
                      <a
                        href={lead.google_maps_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white text-xs"
                      >
                        Maps ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
