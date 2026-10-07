#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

function parseArgs() {
  const args = {
    feedPath: join(REPO_ROOT, 'feed-wearables.json'),
    strict: false,
    reportPath: null
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--strict') args.strict = true;
    else if (arg.startsWith('--report=')) args.reportPath = arg.slice('--report='.length);
    else if (arg.startsWith('--feed=')) args.feedPath = arg.slice('--feed='.length);
  }
  return args;
}

function normalizedTitle(item) {
  return `${item.sourceName || ''}|${item.title || ''}`
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function addContentFinding(findings, kind, item, detail) {
  findings.push({
    kind,
    sourceName: item.sourceName || null,
    title: item.title || null,
    url: item.url || null,
    detail
  });
}

function hasBadEntryTitle(title) {
  const t = String(title || '').toLowerCase().replace(/[’‘]/g, "'");
  return [
    /^newsroom\b/,
    /\bnewsroom\s*[|\-–]/,
    /^press\s+(?:room|releases?|center|centre)\b/,
    /^user\s+(?:guide|manual)\b/,
    /\buser\s+(?:guide|manual)\s*[|\-–]/,
    /^help\s*(?:center|centre)?$/,
    /^getting started\b/,
    /^quick start\b/,
    /^api\s*(?:docs?|reference|home)\b/,
    /^glossary\b/,
    /\bglossary\s*[|\-–]/,
    /^fetch data example\b/,
    /\bexamples?\s*[|\-–]/,
    /^(blog|search|research papers?)\s*[|\-–]/,
    /\|\s*apple developer documentation$/,
    /^[a-z][a-z0-9]*\([^)]*\)$/
  ].some(re => re.test(t));
}

function hasBadUrl(url) {
  let pathname = '';
  try {
    pathname = new URL(url).pathname.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return false;
  }
  const badPaths = [
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/terms-of-use',
    '/help',
    '/help-center',
    '/user-guide',
    '/user-manual',
    '/manual',
    '/support',
    '/faq',
    '/login',
    '/signin',
    '/sign-in'
  ];
  const badPatterns = [
    /\/(?:developer|integration)-guide\/.*(?:example|sample|tutorial|getting-started|quickstart)/,
    /\/(?:examples?|samples?|tutorials?)\//
  ];
  return badPaths.some(path => pathname === path || pathname.startsWith(`${path}/`))
    || badPatterns.some(re => re.test(pathname));
}

function nearDuplicateTitleKey(item) {
  const words = String(item.title || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\b(?:samsung|apple|google|fitbit|whoop|oura|garmin|dexcom|newsroom|global|canada|philippines)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 5) return null;
  return words.slice(0, 5).join(' ');
}

export function scanFeed(feed) {
  const findings = [];
  const warnings = [...(feed.healthcheck?.warnings || [])];
  const items = Array.isArray(feed.items) ? feed.items : [];
  if (!items.length) addContentFinding(findings, 'empty_feed', {}, 'Feed must contain at least one selected item');
  const generatedAt = Date.parse(feed.generatedAt);
  const days = Number(feed.lookbackDays);
  if (Number(feed.schemaVersion) >= 2) {
    if (!Number.isFinite(generatedAt)) addContentFinding(findings, 'invalid_generated_at', {}, 'generatedAt must be parseable');
    if (!Number.isFinite(days) || days < 1) addContentFinding(findings, 'invalid_lookback_days', {}, 'lookbackDays must be positive');
  }
  const htmlRe = /<\/?(?:p|a|img|div|span|br|strong|em|ul|ol|li|script|style)\b/i;
  const entityRe = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
  const markdownLinkRe = /\[[^\]]+\]\([^)]+\)/;
  const markdownHeadingRe = /(^|\s)#{1,6}\s+\S/;
  const seenUrls = new Set();
  const seenTitles = new Set();
  const seenNearTitles = new Map();

  for (const item of items) {
    const body = `${item.title || ''} ${item.summary || ''}`;
    if (Number.isFinite(generatedAt) && Number.isFinite(days) && days > 0) {
      const date = Date.parse(item.publishedAt);
      if (!Number.isFinite(date) && item.retrievalMethod !== 'tavily' && item.sourceCategory !== 'vendor_websearch') {
        addContentFinding(findings, 'invalid_publication_date', item, 'Missing or invalid publishedAt');
      } else if (Number.isFinite(date) && (date > generatedAt + 86400000 || date < generatedAt - days * 86400000)) {
        addContentFinding(findings, 'date_outside_window', item, 'Publication date is outside the feed window');
      }
    }
    if (!item.url) addContentFinding(findings, 'missing_url', item, 'Feed items must include a URL');
    if (seenUrls.has(item.url)) addContentFinding(findings, 'duplicate_url', item, item.url);
    seenUrls.add(item.url);

    const titleKey = normalizedTitle(item);
    if (seenTitles.has(titleKey)) addContentFinding(findings, 'duplicate_title', item, titleKey);
    seenTitles.add(titleKey);
    const nearTitleKey = nearDuplicateTitleKey(item);
    if (nearTitleKey && seenNearTitles.has(nearTitleKey)) {
      addContentFinding(findings, 'near_duplicate_title', item, `Near duplicate of: ${seenNearTitles.get(nearTitleKey)}`);
    }
    if (nearTitleKey) seenNearTitles.set(nearTitleKey, item.title || '<untitled>');

    if (htmlRe.test(body)) addContentFinding(findings, 'html_residue', item, 'Title or summary contains HTML tags');
    if (entityRe.test(body)) addContentFinding(findings, 'entity_residue', item, 'Title or summary contains HTML entities');
    if (markdownLinkRe.test(body)) addContentFinding(findings, 'markdown_link_residue', item, 'Title or summary contains markdown links');
    if (markdownHeadingRe.test(body)) addContentFinding(findings, 'markdown_heading_residue', item, 'Title or summary contains markdown headings');
    if (hasBadEntryTitle(item.title)) addContentFinding(findings, 'entry_page_title', item, 'Title looks like a hub, guide, or API index page');
    if (hasBadUrl(item.url)) addContentFinding(findings, 'entry_page_url', item, 'URL path looks like a hub, guide, help, privacy, or terms page');
  }

  if (Number(feed.stats?.tavilySitesFailed || 0) > 0) {
    warnings.push(`${feed.stats.tavilySitesFailed} Tavily site(s) failed; coverage degraded`);
  }

  const hasSelectionLayer = Number(feed.schemaVersion || 0) >= 2 || feed.candidateStats || feed.candidateItems;
  if (hasSelectionLayer) {
    if (!Array.isArray(feed.candidateItems)) addContentFinding(findings, 'missing_candidate_items', {}, 'schemaVersion >= 2 requires candidateItems');
    if (!feed.candidateStats || typeof feed.candidateStats !== 'object') addContentFinding(findings, 'missing_candidate_stats', {}, 'schemaVersion >= 2 requires candidateStats');
    const selectedCandidateCount = (feed.candidateItems || []).filter(item => item.selectionStatus === 'selected').length;
    if (selectedCandidateCount !== items.length) {
      addContentFinding(findings, 'candidate_selected_mismatch', {}, `candidateItems selected=${selectedCandidateCount}, items=${items.length}`);
    }
    if (feed.candidateStats && feed.candidateStats.selectedItems !== items.length) {
      addContentFinding(findings, 'candidate_stats_mismatch', {}, `candidateStats.selectedItems=${feed.candidateStats.selectedItems}, items=${items.length}`);
    }
    if (Number(feed.lookbackDays) === 30 && (items.length < 35 || items.length > 55)) {
      warnings.push(`30-day selected item count is ${items.length}; target range is 35-55`);
    }
  }

  return { findings, warnings, hasSelectionLayer };
}

export function checkFeedQuality(feed, { strict = false } = {}) {
  const { findings, warnings, hasSelectionLayer } = scanFeed(feed);
  const strictContent = strict || Boolean(hasSelectionLayer);
  const blockingFindings = strictContent ? findings
    : findings.filter(f => ['empty_feed', 'missing_url', 'duplicate_url', 'duplicate_title'].includes(f.kind));
  const legacyWarnings = strictContent ? [] : findings.filter(f => !blockingFindings.includes(f));
  return { status: blockingFindings.length ? 'failed' : 'passed', schemaVersion: feed.schemaVersion || null,
    itemCount: Array.isArray(feed.items) ? feed.items.length : 0,
    candidateItems: Array.isArray(feed.candidateItems) ? feed.candidateItems.length : null,
    strict: strictContent, findings: blockingFindings,
    warnings: [...new Set([...warnings, ...legacyWarnings.map(f => `Legacy feed content issue (${f.kind}): ${f.title || f.detail}`)])] };
}

async function main() {
  const args = parseArgs();
  let report;
  try { report = checkFeedQuality(JSON.parse(await readFile(args.feedPath, 'utf-8')), args); }
  catch (error) { report = { status: 'failed', itemCount: 0, warnings: [], findings: [{ kind: 'unreadable_feed', detail: error.message }] }; }
  if (args.reportPath) {
    await mkdir(dirname(resolve(args.reportPath)), { recursive: true });
    await writeFile(args.reportPath, JSON.stringify(report, null, 2));
  }
  for (const warning of report.warnings) console.error(`warning: ${warning}`);
  if (report.status === 'failed') {
    console.error('Feed quality check failed:');
    for (const finding of report.findings) console.error(`- ${finding.kind}: ${finding.title || finding.detail}${finding.url ? ` (${finding.url})` : ''}`);
    process.exitCode = 1;
  } else console.log(JSON.stringify({ ...report, status: 'ok', feedPath: args.feedPath, warnings: report.warnings.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
