import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings — Oni Agent' };

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-gray-400 text-sm">
        API keys, discovery config, and notification preferences.
        <br />
        <span className="text-gray-600">Coming in the next phase.</span>
      </p>
    </div>
  );
}
