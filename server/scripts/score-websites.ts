import 'dotenv/config';
import { scoreWebsites } from '../src/services/website-scoring.service';

async function main() {
  const args = process.argv.slice(2);
  const keepScreenshots = args.includes('--keep-screenshots');

  let batchSize = 5;
  const batchArg = args.find((arg) => arg.startsWith('--batch-size='));
  if (batchArg) {
    const parsed = parseInt(batchArg.split('=')[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      batchSize = parsed;
    }
  }

  console.log('────────────────────────────────────────────────────────────');
  console.log(' Oni Lead Generator — Website Quality Scoring Job');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`⚙️  Batch Size:       ${batchSize}`);
  console.log(`📷 Keep Screenshots: ${keepScreenshots ? 'Yes' : 'No'}\n`);

  try {
    const summary = await scoreWebsites({ batchSize, keepScreenshots });

    console.log('\n────────────────────────────────────────────────────────────');
    console.log('🎉 Website Scoring Completed!');
    console.log(`   Total Processed:    ${summary.totalProcessed}`);
    console.log(`   Summary Buckets:    ${summary.good} Good, ${summary.average} Average, ${summary.poor} Poor, ${summary.broken} Broken`);
    console.log('────────────────────────────────────────────────────────────\n');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${message}\n`);
    process.exit(1);
  }
}

main();
