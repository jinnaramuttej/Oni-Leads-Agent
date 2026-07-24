import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import type { LeadStatus, WebsiteQuality } from '@leads/shared';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

interface ImportLeadInput {
  lead_number: string;
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
  place_id: string | null; // Nullable for legacy leads
  lead_status: LeadStatus;
  outreach_stage: string | null;
  notes: string | null;
  date_found: string;
}

interface ValidationError {
  rowNumber: number;
  leadNumber: string;
  reason: string;
}

// ─── Cell Parser Helper ───────────────────────────────────────────────────────

function getCellString(cellValue: ExcelJS.CellValue): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'string') return cellValue.trim();
  if (typeof cellValue === 'number' || typeof cellValue === 'boolean') {
    return String(cellValue).trim();
  }
  if (cellValue instanceof Date) return cellValue.toISOString();
  if (typeof cellValue === 'object') {
    if ('result' in cellValue && cellValue.result !== undefined && cellValue.result !== null) {
      return String(cellValue.result).trim();
    }
    if ('text' in cellValue && cellValue.text !== undefined && cellValue.text !== null) {
      return String(cellValue.text).trim();
    }
    if ('hyperlink' in cellValue && cellValue.hyperlink) {
      return String(cellValue.text || cellValue.hyperlink).trim();
    }
    if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((rt) => rt.text).join('').trim();
    }
  }
  return String(cellValue).trim();
}

function getCellHyperlink(cell: ExcelJS.Cell): string | null {
  if (!cell.value) return null;
  if (typeof cell.value === 'object' && 'hyperlink' in cell.value && cell.value.hyperlink) {
    return String(cell.value.hyperlink).trim();
  }
  const str = getCellString(cell.value);
  if (!str || str.toUpperCase() === 'N/A' || str === '-') return null;
  return str.startsWith('http://') || str.startsWith('https://') ? str : null;
}

// ─── Value Normalizers ────────────────────────────────────────────────────────

function normalizeWebsiteQuality(val: string): WebsiteQuality {
  const lower = val.toLowerCase().trim();
  if (lower === 'good') return 'good';
  if (lower === 'average') return 'average';
  if (lower === 'poor') return 'poor';
  if (lower === 'broken') return 'broken';
  return 'unassessed';
}

function normalizeLeadStatus(val: string): LeadStatus {
  const lower = val.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (lower === 'contacted') return 'contacted';
  if (lower === 'interested') return 'interested';
  if (lower === 'dead') return 'dead';
  if (lower === 'converted') return 'converted';
  return 'not_contacted';
}

function makeComboKey(businessName: string, phone: string | null): string {
  const normName = businessName.toLowerCase().trim().replace(/\s+/g, ' ');
  const normPhone = (phone || '').replace(/\D/g, '');
  return `${normName}|${normPhone}`;
}

// ─── Main Migration Function ──────────────────────────────────────────────────

async function runImport() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const filePathArg = args.find((arg) => !arg.startsWith('--'));

  console.log('────────────────────────────────────────────────────────────');
  console.log(' Oni Lead Generator — Excel Legacy Import Script');
  console.log('────────────────────────────────────────────────────────────');

  if (!filePathArg) {
    console.error('❌ Error: Missing required Excel file path argument.\n');
    console.log('Usage:');
    console.log('  pnpm import-excel <path-to-file.xlsx> [--dry-run]');
    console.log('  npx tsx scripts/import-excel.ts <path-to-file.xlsx> [--dry-run]\n');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found at path: ${resolvedPath}\n`);
    process.exit(1);
  }

  console.log(`📁 Source File: ${resolvedPath}`);
  console.log(`⚙️  Mode:        ${isDryRun ? 'DRY RUN (No database changes)' : 'LIVE IMPORT'}\n`);

  // Setup Supabase Client if credentials exist
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let supabase: ReturnType<typeof createClient> | null = null;

  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } else if (!isDryRun) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment for live import.\n');
    process.exit(1);
  } else {
    console.log('⚠️  Warning: Supabase environment variables not set. Duplicate check against database will be skipped in dry-run.\n');
  }

  // 1. Fetch existing combos from Supabase for deduplication
  const existingComboSet = new Set<string>();
  if (supabase) {
    console.log('🔍 Fetching existing leads from Supabase for deduplication...');
    const { data: existingLeads, error } = await supabase
      .from('leads')
      .select('business_name, phone');

    if (error) {
      console.error(`⚠️  Warning: Failed to fetch existing leads for dedupe: ${error.message}`);
    } else if (existingLeads) {
      for (const row of existingLeads) {
        existingComboSet.add(makeComboKey(row.business_name, row.phone));
      }
      console.log(`✓ Loaded ${existingComboSet.size} existing lead dedupe keys from database.\n`);
    }
  }

  // 2. Read Excel Workbook
  console.log('📖 Reading Excel file...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvedPath);

  const sheet = workbook.getWorksheet('Lead Tracker') || workbook.worksheets[0];
  if (!sheet) {
    console.error('❌ Error: Could not find "Lead Tracker" or any worksheet in the Excel file.\n');
    process.exit(1);
  }

  console.log(`✓ Using Worksheet: "${sheet.name}"\n`);

  // 3. Parse Data Rows starting at Row 5
  const leadsToInsert: ImportLeadInput[] = [];
  const validationErrors: ValidationError[] = [];
  let totalRowsRead = 0;
  let skippedDuplicates = 0;

  const seenInSheetCombos = new Set<string>();

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Header is row 4, data starts row 5
    if (rowNumber < 5) return;

    const colA_leadId = getCellString(row.getCell(1).value);

    // Requirement: Stop at first row with empty Lead ID
    if (!colA_leadId) {
      return;
    }

    totalRowsRead++;

    const colB_name = getCellString(row.getCell(2).value);
    const colC_category = getCellString(row.getCell(3).value);
    const colD_cityArea = getCellString(row.getCell(4).value);
    const colE_phoneRaw = getCellString(row.getCell(5).value);
    const colF_hasWebRaw = getCellString(row.getCell(6).value);
    const colG_webUrlRaw = getCellString(row.getCell(7).value);
    const colG_hyperlink = getCellHyperlink(row.getCell(7));
    const colH_webQualityRaw = getCellString(row.getCell(8).value);
    const colI_mapsLinkRaw = getCellString(row.getCell(9).value);
    const colI_mapsHyperlink = getCellHyperlink(row.getCell(9));
    const colJ_ratingRaw = getCellString(row.getCell(10).value);
    const colK_reviewCountRaw = getCellString(row.getCell(11).value);
    const colL_statusRaw = getCellString(row.getCell(12).value);
    const colM_outreachStageRaw = getCellString(row.getCell(13).value);
    const colN_notesRaw = getCellString(row.getCell(14).value);
    const colO_dateFoundRaw = row.getCell(15).value;

    // Validation
    if (!colB_name) {
      validationErrors.push({
        rowNumber,
        leadNumber: colA_leadId,
        reason: 'Missing Business Name (Column B)',
      });
      return;
    }

    // Phone parsing
    const phone = colE_phoneRaw && colE_phoneRaw.toUpperCase() !== 'N/A' && colE_phoneRaw !== '-' ? colE_phoneRaw : null;

    // Deduplication check: business_name + phone
    const comboKey = makeComboKey(colB_name, phone);
    if (existingComboSet.has(comboKey) || seenInSheetCombos.has(comboKey)) {
      skippedDuplicates++;
      return;
    }
    seenInSheetCombos.add(comboKey);

    // Website & URL parsing
    const website_url = colG_hyperlink || (colG_webUrlRaw && colG_webUrlRaw.toUpperCase() !== 'N/A' && colG_webUrlRaw !== '-' ? colG_webUrlRaw : null);
    let has_website = false;
    const hasWebLower = colF_hasWebRaw.toLowerCase();
    if (hasWebLower === 'yes' || hasWebLower === 'y' || hasWebLower === 'true') {
      has_website = true;
    } else if (hasWebLower === 'no' || hasWebLower === 'n' || hasWebLower === 'false') {
      has_website = false;
    } else {
      has_website = Boolean(website_url);
    }

    // Google Maps Link parsing
    const google_maps_link = colI_mapsHyperlink || (colI_mapsLinkRaw && colI_mapsLinkRaw.toUpperCase() !== 'N/A' && colI_mapsLinkRaw !== '-' ? colI_mapsLinkRaw : null);

    // Google Rating parsing
    const parsedRating = parseFloat(colJ_ratingRaw);
    const google_rating = !isNaN(parsedRating) ? parsedRating : null;

    // Review Count
    const review_count = colK_reviewCountRaw && colK_reviewCountRaw.toUpperCase() !== 'N/A' && colK_reviewCountRaw !== '-' ? colK_reviewCountRaw : null;

    // Outreach Stage & Notes
    const outreach_stage = colM_outreachStageRaw && colM_outreachStageRaw.toUpperCase() !== 'N/A' ? colM_outreachStageRaw : null;
    const notes = colN_notesRaw && colN_notesRaw.toUpperCase() !== 'N/A' ? colN_notesRaw : null;

    // Date Found parsing
    let date_found = new Date().toISOString();
    if (colO_dateFoundRaw instanceof Date) {
      date_found = colO_dateFoundRaw.toISOString();
    } else if (typeof colO_dateFoundRaw === 'string' && colO_dateFoundRaw.trim()) {
      const parsedDate = new Date(colO_dateFoundRaw);
      if (!isNaN(parsedDate.getTime())) {
        date_found = parsedDate.toISOString();
      }
    }

    // Construct Lead Object
    const lead: ImportLeadInput = {
      lead_number: colA_leadId,
      business_name: colB_name,
      category: colC_category || 'Uncategorized',
      city_area: colD_cityArea || 'Unknown Area',
      phone,
      has_website,
      website_url,
      website_quality: normalizeWebsiteQuality(colH_webQualityRaw),
      website_quality_notes: null,
      google_maps_link,
      google_rating,
      review_count,
      place_id: null, // Legacy row without place_id
      lead_status: normalizeLeadStatus(colL_statusRaw),
      outreach_stage,
      notes,
      date_found,
    };

    leadsToInsert.push(lead);
  });

  console.log(`📊 Processing Summary:`);
  console.log(`   Total Rows Read:          ${totalRowsRead}`);
  console.log(`   Valid Leads to Import:    ${leadsToInsert.length}`);
  console.log(`   Duplicates Skipped:       ${skippedDuplicates}`);
  console.log(`   Validation Failures:      ${validationErrors.length}\n`);

  if (validationErrors.length > 0) {
    console.log('⚠️ Validation Failures Detail:');
    validationErrors.forEach((err) => {
      console.log(`   Row ${err.rowNumber} (${err.leadNumber}): ${err.reason}`);
    });
    console.log('');
  }

  // 4. Perform Insertion (or report for dry run)
  if (isDryRun) {
    console.log('🔍 [DRY RUN] Sample parsed leads (first 3):');
    console.log(JSON.stringify(leadsToInsert.slice(0, 3), null, 2));
    console.log('\n✅ Dry run completed successfully. No data was written to Supabase.');
    return;
  }

  if (leadsToInsert.length === 0) {
    console.log('ℹ️ No new leads to insert.');
    return;
  }

  if (!supabase) {
    console.error('❌ Supabase client unavailable. Cannot perform live insert.');
    process.exit(1);
  }

  console.log(`🚀 Starting batch insert for ${leadsToInsert.length} leads into Supabase...`);
  const BATCH_SIZE = 50;
  let totalInserted = 0;

  for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
    const chunk = leadsToInsert.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(leadsToInsert.length / BATCH_SIZE);

    console.log(`   Inserting batch ${batchNum}/${totalBatches} (${chunk.length} rows)...`);

    const { error } = await supabase.from('leads').insert(chunk);

    if (error) {
      console.error(`   ⚠️ Batch ${batchNum} failed: ${error.message}. Retrying row-by-row...`);
      for (const lead of chunk) {
        const { error: singleErr } = await supabase.from('leads').insert(lead);
        if (singleErr) {
          validationErrors.push({
            rowNumber: -1,
            leadNumber: lead.lead_number,
            reason: `Supabase insert failed: ${singleErr.message}`,
          });
        } else {
          totalInserted++;
        }
      }
    } else {
      totalInserted += chunk.length;
    }
  }

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('🎉 Migration Completed!');
  console.log(`   Total Rows Read:      ${totalRowsRead}`);
  console.log(`   Total Inserted:       ${totalInserted}`);
  console.log(`   Duplicates Skipped:   ${skippedDuplicates}`);
  console.log(`   Errors / Failures:    ${validationErrors.length}`);
  console.log('────────────────────────────────────────────────────────────\n');
}

runImport().catch((err) => {
  console.error('💥 Fatal error during import script execution:', err);
  process.exit(1);
});
