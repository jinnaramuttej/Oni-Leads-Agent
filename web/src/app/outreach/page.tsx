import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Outreach — Oni Agent' };

export default function OutreachPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Outreach</h1>
      <p className="text-gray-400 text-sm">
        Send and track WhatsApp messages to interested leads.
        <br />
        <span className="text-gray-600">Coming in the next phase.</span>
      </p>
    </div>
  );
}
