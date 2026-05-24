#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

function parseArgs() {
  const args = {
    feedPath: join(REPO_ROOT, 'feed-wearables.json'),
    strict: false
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--strict') args.strict = true;
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
  return [
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
  ].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function knownNoise(item) {
  const hay = `${item.title || ''} ${item.summary || ''} ${item.url || ''}`.toLowerCase();
  const patterns = [
    'health tech weekly rundown',
    'best recovery activities',
    'product launch was harder than a marathon',
    'pride collection',
    'xiaomi smart band 10 glimmer edition hyperos',
    'new.c.mi.com',
    'your oura readiness score',
    'reviewed-by',
    'first impressions',
    'podcast'
  ];
  return patterns.find(pattern => hay.includes(pattern)) || null;
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

function scanFeed(feed) {
  const findings = [];
  const warnings = [];
  const items = Array.isArray(feed.items) ? feed.items : [];
  const htmlRe = /<\/?(?:p|a|img|div|span|br|strong|em|ul|ol|li|script|style)\b/i;
  const entityRe = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
  const markdownLinkRe = /\[[^\]]+\]\([^)]+\)/;
  const markdownHeadingRe = /(^|\s)#{1,6}\s+\S/;
  const seenUrls = new Set();
  const seenTitles = new Set();
  const seenNearTitles = new Map();

  for (const item of items) {
    const body = `${item.title || ''} ${item.summary || ''}`;
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
    const noise = knownNoise(item);
    if (noise) addContentFinding(findings, 'known_noise', item, noise);
  }

  if (Number(feed.stats?.tavilySitesFailed || 0) > 0) {
    addContentFinding(findings, 'tavily_failure', {}, `${feed.stats.tavilySitesFailed} Tavily site(s) failed`);
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

const args = parseArgs();
const feed = JSON.parse(await readFile(args.feedPath, 'utf-8'));
const { findings, warnings, hasSelectionLayer } = scanFeed(feed);
const strictContent = args.strict || hasSelectionLayer;
const blockingFindings = strictContent
  ? findings
  : findings.filter(f => ['missing_url', 'duplicate_url', 'duplicate_title'].includes(f.kind));
const legacyWarnings = strictContent ? [] : findings.filter(f => !blockingFindings.includes(f));

for (const warning of warnings) console.error(`warning: ${warning}`);
for (const finding of legacyWarnings) {
  console.error(`warning: legacy feed content issue (${finding.kind}): ${finding.title || finding.detail}`);
}

if (blockingFindings.length > 0) {
  console.error('Feed quality check failed:');
  for (const finding of blockingFindings) {
    console.error(`- ${finding.kind}: ${finding.title || finding.detail}${finding.url ? ` (${finding.url})` : ''}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ok',
  feedPath: args.feedPath,
  schemaVersion: feed.schemaVersion || null,
  itemCount: Array.isArray(feed.items) ? feed.items.length : 0,
  candidateItems: Array.isArray(feed.candidateItems) ? feed.candidateItems.length : null,
  strict: strictContent,
  warnings: warnings.length + legacyWarnings.length
}));
