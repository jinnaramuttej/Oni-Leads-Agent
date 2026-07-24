import 'dotenv/config';
import type { DiscoveryConfig } from '@leads/shared';
import { discoverLeads } from '../src/services/discovery.service';

// Sample configs as required
const DEFAULT_CONFIGS: DiscoveryConfig[] = [
  { category: 'restaurant', area: 'Banjara Hills, Hyderabad' },
  { category: 'salon', area: 'Ameerpet, Hyderabad' },
];

async function main() {
  console.log('────────────────────────────────────────────────────────────');
  console.log(' Oni Lead Generator — Google Places Discovery Job');
  console.log('────────────────────────────────────────────────────────────\n');

  try {
    const summary = await discoverLeads(DEFAULT_CONFIGS);

    console.log('\n────────────────────────────────────────────────────────────');
    console.log('🎉 Discovery Completed!');
    console.log(`   Total Searched:        ${summary.searched}`);
    console.log(`   New Leads Added:       ${summary.newLeadsAdded}`);
    console.log(`   Skipped Duplicates:    ${summary.skippedDuplicates}`);
    console.log('────────────────────────────────────────────────────────────\n');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n💥 Discovery failed: ${message}\n`);
    process.exit(1);
  }
}

main();
