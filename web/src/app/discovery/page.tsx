import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Discovery — Oni Agent' };

export default function DiscoveryPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Discovery</h1>
      <p className="text-gray-400 text-sm">
        Configure category + area pairs to run the Google Places discovery job.
        <br />
        <span className="text-gray-600">Coming in the next phase.</span>
      </p>
    </div>
  );
}
