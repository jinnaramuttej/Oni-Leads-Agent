import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import type { WebsiteQuality } from '@leads/shared';
import { supabase } from '../lib/supabase';
import { leadsService } from './leads.service';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface WebsiteScoringOptions {
  batchSize?: number;
  keepScreenshots?: boolean;
}

export interface WebsiteScoringSummary {
  good: number;
  average: number;
  poor: number;
  broken: number;
  totalProcessed: number;
}

interface OllamaTagModel {
  name: string;
  model: string;
  details?: {
    family?: string;
    families?: string[];
  };
}

interface OllamaTagsResponse {
  models?: OllamaTagModel[];
}

const VISION_MODEL_KEYWORDS = [
  'llava',
  'bakllava',
  'llama3.2-vision',
  'moondream',
  'qwen2-vl',
  'minicpm-v',
  'vision',
];

// ─── Ollama Connection & Vision Check ────────────────────────────────────────

export async function verifyOllamaVisionModel(): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const tagsUrl = `${baseUrl.replace(/\/+$/, '')}/api/tags`;

  let response: Response;
  try {
    response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err: unknown) {
    throw new Error(
      `❌ Ollama not reachable at ${baseUrl}. Is Ollama running? (${err instanceof Error ? err.message : String(err)})`
    );
  }

  if (!response.ok) {
    throw new Error(`❌ Ollama server returned status ${response.status} at ${tagsUrl}`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  const installedModels = data.models ?? [];
  const modelNames = installedModels.map((m) => m.name || m.model);

  // If user explicitly configured an env var
  const envModel = process.env.OLLAMA_VISION_MODEL;
  if (envModel) {
    const found = installedModels.find(
      (m) => m.name === envModel || m.name.startsWith(`${envModel}:`) || m.model === envModel
    );
    if (found) return found.name;
  }

  // Find any vision-capable model locally installed
  const matchedVisionModel = installedModels.find((m) => {
    const nameLower = (m.name || m.model || '').toLowerCase();
    const families = m.details?.families || [];
    return (
      VISION_MODEL_KEYWORDS.some((kw) => nameLower.includes(kw)) ||
      families.some((fam) => fam.toLowerCase().includes('vision') || fam.toLowerCase().includes('mllm'))
    );
  });

  if (matchedVisionModel) {
    return matchedVisionModel.name;
  }

  const modelListStr = modelNames.length > 0 ? modelNames.join(', ') : 'none';
  throw new Error(
    `❌ No vision-capable model found in Ollama.\nInstalled models: [${modelListStr}].\n` +
      `Please pull a vision model by running e.g.:\n` +
      `  ollama pull llava\n` +
      `  or\n` +
      `  ollama pull llama3.2-vision`
  );
}

// ─── Main Website Quality Scoring Function ────────────────────────────────────

export async function scoreWebsites(
  options: WebsiteScoringOptions = {}
): Promise<WebsiteScoringSummary> {
  const batchSize = options.batchSize ?? 5;
  const keepScreenshots = options.keepScreenshots ?? false;

  // 1. Verify Ollama & get vision model name
  const visionModel = await verifyOllamaVisionModel();
  console.log(`✓ Ollama connection verified. Using vision model: "${visionModel}"\n`);

  // 2. Query initial total unassessed count
  const initialTotalCount = await leadsService.getUnassessedWebLeadsCount();

  const summary: WebsiteScoringSummary = {
    good: 0,
    average: 0,
    poor: 0,
    broken: 0,
    totalProcessed: 0,
  };

  if (initialTotalCount === 0) {
    console.log('ℹ️ No leads found with has_website = true and website_quality = "unassessed".\n');
    return summary;
  }

  console.log(`🚀 Found ${initialTotalCount} unassessed website leads. Starting batch processing...\n`);

  // Setup screenshot directory
  const screenshotsDir = path.resolve(process.cwd(), 'tmp', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 3. Launch Playwright Headless Browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  try {
    let batchIndex = 1;

    while (true) {
      const leads = await leadsService.getUnassessedWebLeads(batchSize);
      if (leads.length === 0) {
        break;
      }

      for (const lead of leads) {
        if (!lead.website_url) continue;

        const page = await context.newPage();
        let loaded = false;
        let reachabilityError = 'Site unreachable';
        let hasViewportMeta = false;

        // Clean website URL format
        let targetUrl = lead.website_url.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = `https://${targetUrl}`;
        }

        try {
          const response = await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });

          if (response && response.status() < 400) {
            loaded = true;
            hasViewportMeta = await page
              .evaluate(() => Boolean(document.querySelector('meta[name="viewport"]')))
              .catch(() => false);
          } else {
            reachabilityError = response ? `HTTP status ${response.status()}` : 'No response from server';
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Timeout') || msg.includes('timeout')) {
            reachabilityError = 'Timeout after 15s';
          } else if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('ENOTFOUND')) {
            reachabilityError = 'DNS not found';
          } else if (msg.includes('CERT') || msg.includes('SSL') || msg.includes('ERR_CERT')) {
            reachabilityError = 'SSL error';
          } else if (msg.includes('ERR_CONNECTION_REFUSED')) {
            reachabilityError = 'Connection refused';
          } else {
            reachabilityError = 'Site unreachable';
          }
        }

        // If site failed to load / unreachable
        if (!loaded) {
          await page.close();
          await leadsService.update(lead.id, {
            website_quality: 'broken',
            website_quality_notes: reachabilityError,
          });
          summary.broken++;
          summary.totalProcessed++;
          console.log(`Scoring ${lead.lead_number} - ${lead.business_name}... Broken - ${reachabilityError}`);
          continue;
        }

        // If site loaded successfully, capture full-page screenshot
        const screenshotPath = path.join(screenshotsDir, `${lead.lead_number}.png`);
        try {
          await page.screenshot({ path: screenshotPath, fullPage: false });
        } catch {
          // Fallback to normal viewport screenshot if fullPage fails
          await page.screenshot({ path: screenshotPath });
        }
        await page.close();

        // Read image as Base64 for Ollama
        const imageBuffer = fs.readFileSync(screenshotPath);
        const base64Image = imageBuffer.toString('base64');

        // Prompt Ollama Vision Model
        const prompt =
          `You are assessing a small local business website for how professional and trustworthy it looks to a potential customer. ` +
          `Based on this screenshot, rate the website as one of: Good, Average, Poor, Broken. ` +
          `Consider: does it look outdated or modern? Is it mobile-friendly (viewport tag present: ${hasViewportMeta})? ` +
          `Does it look actively maintained? Respond in this exact format only:\n` +
          `Rating: <Good/Average/Poor/Broken>\n` +
          `Reason: <one short sentence, max 15 words>`;

        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const generateUrl = `${baseUrl.replace(/\/+$/, '')}/api/generate`;

        const ollamaRes = await fetch(generateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: visionModel,
            prompt,
            images: [base64Image],
            stream: false,
          }),
        });

        if (!ollamaRes.ok) {
          const errBody = await ollamaRes.text();
          throw new Error(`Ollama generation failed with status ${ollamaRes.status}: ${errBody}`);
        }

        const ollamaData = (await ollamaRes.json()) as { response?: string };
        const responseText = ollamaData.response || '';

        // Parse Rating & Reason from Ollama text output
        let quality: WebsiteQuality = 'average';
        let notes = 'Assessed via vision model';

        const ratingMatch = responseText.match(/Rating:\s*(Good|Average|Poor|Broken)/i);
        if (ratingMatch) {
          const matched = ratingMatch[1].toLowerCase();
          if (matched === 'good' || matched === 'average' || matched === 'poor' || matched === 'broken') {
            quality = matched;
          }
        }

        const reasonMatch = responseText.match(/Reason:\s*(.+)/i);
        if (reasonMatch) {
          notes = reasonMatch[1].trim();
        } else if (responseText.trim()) {
          notes = responseText.trim().split('\n')[0].substring(0, 100);
        }

        // Update Supabase lead record
        await leadsService.update(lead.id, {
          website_quality: quality,
          website_quality_notes: notes,
        });

        summary[quality]++;
        summary.totalProcessed++;

        const capitalizedQuality = quality.charAt(0).toUpperCase() + quality.slice(1);
        console.log(`Scoring ${lead.lead_number} - ${lead.business_name}... ${capitalizedQuality} - ${notes}`);

        // Delete screenshot unless --keep-screenshots flag was supplied
        if (!keepScreenshots && fs.existsSync(screenshotPath)) {
          try {
            fs.unlinkSync(screenshotPath);
          } catch {
            // ignore cleanup errors
          }
        }
      }

      console.log(`\n📦 Batch ${batchIndex} complete — ${summary.totalProcessed}/${initialTotalCount} processed so far\n`);

      // Query Supabase again for remaining unassessed leads
      const remainingCount = await leadsService.getUnassessedWebLeadsCount();
      if (remainingCount > 0) {
        // Small delay (2.5 seconds) between batches to avoid hammering Ollama/Playwright back-to-back
        await new Promise((resolve) => setTimeout(resolve, 2500));
        batchIndex++;
      } else {
        break;
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return summary;
}
