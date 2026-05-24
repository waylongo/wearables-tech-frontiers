#!/usr/bin/env node

// ============================================================================
// /wtf — Prepare Digest
// ============================================================================
// Default mode reads the centrally generated GitHub feed. Local RSS fallback is
// kept for --no-remote, remote failures, and user-private source overrides.
//
// Output (stdout): one JSON blob for the agent to remix. The LLM must not refetch
// article URLs or run vendor websearch; those are handled by the central feed.
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILL_ROOT = join(__dirname, '..');
const LOCAL_CATALOG = join(SKILL_ROOT, 'config', 'sources.json');
const LOCAL_PROMPTS_DIR = join(SKILL_ROOT, 'prompts');

const USER_DIR = join(homedir(), '.wtf');
const USER_CONFIG = join(USER_DIR, 'config.json');
const USER_CATALOG = join(USER_DIR, 'sources.json');
const USER_PROMPTS_DIR = join(USER_DIR, 'prompts');

const REMOTE_CONTENTS_BASE = 'https://api.github.com/repos/waylongo/wearables-tech-frontiers/contents';
const REMOTE_FEED = `${REMOTE_CONTENTS_BASE}/feed-wearables.json?ref=main`;
const REMOTE_CATALOG = `${REMOTE_CONTENTS_BASE}/config/sources.json?ref=main`;
const REMOTE_PROMPTS = `${REMOTE_CONTENTS_BASE}/prompts`;

const PROMPT_FILES = [
  'digest-intro.md',
  'summarize-papers.md',
  'summarize-official.md',
  'summarize-news.md',
  'translate.md'
];

const USER_AGENT = 'Mozilla/5.0 (wearables-tech-frontiers-skill/2.0)';
const DAY_MS = 24 * 60 * 60 * 1000;
const CANONICAL_CATEGORIES = ['industry_news', 'company_research', 'academic', 'clinical_regulatory'];
const RETRIEVAL_BUCKETS = ['vendor_websearch'];
const SUPPORTED_CATEGORIES = [...CANONICAL_CATEGORIES, ...RETRIEVAL_BUCKETS];
const DEFAULT_CATEGORIES = CANONICAL_CATEGORIES;

function dedupeOrdered(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function exitConfigError(detail) {
  const payload = typeof detail === 'string'
    ? { status: 'error', message: detail }
    : { status: 'error', ...detail };
  console.error(JSON.stringify(payload));
  process.exit(2);
}

function normalizeCategoryList(value, label) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;
  if (!values) {
    exitConfigError(`${label} must be a comma-separated string or an array`);
  }
  const categories = values.map(s => String(s).trim()).filter(Boolean);
  if (categories.length === 0) {
    exitConfigError(`${label} must include at least one category`);
  }
  // Reject before any catalog/feed load or remote search work.
  const invalid = categories.filter(c => !SUPPORTED_CATEGORIES.includes(c));
  if (invalid.length > 0) {
    exitConfigError({
      message: `${label} contains unsupported category: ${invalid.join(', ')}. Supported categories: ${SUPPORTED_CATEGORIES.join(', ')}`,
      unsupported: invalid,
      supported: SUPPORTED_CATEGORIES
    });
  }
  return dedupeOrdered(categories);
}

async function loadUserConfig(healthcheck) {
  if (!existsSync(USER_CONFIG)) return {};

  let raw;
  try {
    raw = await readFile(USER_CONFIG, 'utf-8');
  } catch (err) {
    healthcheck.warnings.push(`User config unreadable: ${err.message}`);
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    healthcheck.warnings.push(`User config unreadable: ${err.message}`);
    return {};
  }
}

function parseArgs() {
  const args = { days: null, categories: null, noRemote: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--days=')) {
      const n = parseInt(arg.slice(7), 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        console.error(JSON.stringify({ status: 'error', message: `--days must be an integer in [1, 365], got: ${arg.slice(7)}` }));
        process.exit(2);
      }
      args.days = n;
    } else if (arg.startsWith('--category=')) {
      args.categories = normalizeCategoryList(arg.slice(11), '--category');
    } else if (arg === '--no-remote') {
      args.noRemote = true;
    }
  }
  return args;
}

function stripTags(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntitiesOnce(s) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '-',
    ndash: '-',
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
    hellip: '...',
    minus: '-',
    plusmn: '+/-',
    times: 'x',
    ge: '>=',
    le: '<='
  };
  return (s || '')
    .replace(/&([a-z]+);/gi, (m, name) => Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ? named[name.toLowerCase()] : m)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function decodeEntities(s) {
  let out = s || '';
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function extractField(block, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdata = block.match(cdataRe);
  if (cdata) return stripTags(decodeEntities(cdata[1]));
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (m) return stripTags(decodeEntities(m[1]));
  const selfRe = new RegExp(`<${tag}[^>]*href=["']([^"']+)["'][^>]*\\/?>`, 'i');
  const self = block.match(selfRe);
  return self ? self[1] : null;
}

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = extractField(b, 'title');
    const link = extractField(b, 'link');
    const pubDate = extractField(b, 'pubDate') || extractField(b, 'published') || extractField(b, 'updated') || extractField(b, 'dc:date');
    const description = extractField(b, 'description') || extractField(b, 'summary') || extractField(b, 'content') || '';
    if (!title || !link) continue;
    items.push({
      title: title.slice(0, 500),
      url: link,
      publishedAt: normalizePublishedAt(pubDate),
      summary: description.slice(0, 2000)
    });
  }
  return items;
}

async function httpGet(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isGithubContents = url.startsWith(REMOTE_CONTENTS_BASE);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': isGithubContents
          ? 'application/vnd.github.raw+json'
          : 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*'
      }
    });
    if (!res.ok) return { ok: false, status: res.status, text: null };
    return { ok: true, status: res.status, text: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, text: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function loadCatalog(noRemote, healthcheck) {
  if (existsSync(USER_CATALOG)) {
    try {
      const c = JSON.parse(await readFile(USER_CATALOG, 'utf-8'));
      healthcheck.catalog_source = 'user_override';
      return c;
    } catch (err) {
      healthcheck.warnings.push(`User catalog unreadable (${err.message}); falling through`);
    }
  }
  if (!noRemote) {
    const r = await httpGet(REMOTE_CATALOG, 8000);
    if (r.ok) {
      try {
        const c = JSON.parse(r.text);
        healthcheck.catalog_source = 'remote_catalog';
        healthcheck.remote_catalog_version = c.generatedAt || null;
        return c;
      } catch (err) {
        healthcheck.warnings.push(`Remote catalog JSON invalid (${err.message}); falling back to local`);
      }
    } else {
      healthcheck.warnings.push(`Remote catalog fetch failed (status=${r.status})${r.error ? ': ' + r.error : ''}; falling back to local`);
    }
  }
  const c = JSON.parse(await readFile(LOCAL_CATALOG, 'utf-8'));
  healthcheck.catalog_source = 'local_fallback';
  return c;
}

async function loadPrompt(filename, noRemote, healthcheck) {
  const userPath = join(USER_PROMPTS_DIR, filename);
  if (existsSync(userPath)) {
    healthcheck.prompt_sources[filename] = 'user_override';
    return await readFile(userPath, 'utf-8');
  }
  const localPath = join(LOCAL_PROMPTS_DIR, filename);
  if (existsSync(localPath)) {
    healthcheck.prompt_sources[filename] = 'local_repo';
    return await readFile(localPath, 'utf-8');
  }
  if (!noRemote) {
    const r = await httpGet(`${REMOTE_PROMPTS}/${filename}?ref=main`, 6000);
    if (r.ok && r.text) {
      healthcheck.prompt_sources[filename] = 'remote';
      return r.text;
    }
  }
  healthcheck.prompt_sources[filename] = 'MISSING';
  return null;
}

function parseDateMs(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, ' ');
  const candidates = [
    raw,
    collapsed,
    collapsed.replace(/(\d)([ap])\.?m\.?/gi, '$1 $2m')
  ];
  for (const candidate of candidates) {
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function normalizePublishedAt(dateStr) {
  const ms = parseDateMs(dateStr);
  return ms == null ? null : new Date(ms).toISOString();
}

function withinDays(dateStr, days) {
  const ms = parseDateMs(dateStr);
  if (ms == null) return false;
  const now = Date.now();
  if (ms > now + DAY_MS) return false;
  return ms >= now - days * DAY_MS;
}

function hasDateWindow(item, days) {
  if (item.publishedAt) return withinDays(item.publishedAt, days);
  return item.sourceCategory === 'vendor_websearch' || item.retrievalMethod === 'tavily';
}

function formatOpenFdaDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function parseOpenFdaDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function passesKeywordFilter(item, keywords, scope = 'title_summary') {
  if (!keywords?.length) return true;
  const hay = normalizeFilterText(scope === 'title' ? item.title : `${item.title} ${item.summary}`);
  return keywords.some(k => keywordMatches(hay, k));
}

function passesRequiredKeywordFilter(item, keywords, scope = 'title_summary') {
  return passesKeywordFilter(item, keywords, scope);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeFilterText(s) {
  return (s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function keywordMatches(hay, keyword) {
  const k = normalizeFilterText(keyword);
  if (!k) return false;
  if (/^[a-z0-9]+$/.test(k) && k.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRe(k)}([^a-z0-9]|$)`, 'i').test(hay);
  }
  return hay.includes(k);
}

function passesBlacklist(title, patterns) {
  if (!patterns?.length) return true;
  const t = normalizeFilterText(title);
  return !patterns.some(p => t.includes(normalizeFilterText(p)));
}

function passesSourceExcludeFilter(item, patterns) {
  if (!patterns?.length) return true;
  const hay = normalizeFilterText(`${item.title || ''} ${item.summary || ''}`);
  return !patterns.some(p => hay.includes(normalizeFilterText(p)));
}

function inferSignalType(item) {
  const category = item.sourceCategory;
  if (category === 'clinical_regulatory') return 'clinical_regulatory';
  const hay = `${item.title || ''} ${item.summary || ''} ${item.sourceName || ''}`.toLowerCase();
  if (/(fda|510\(k\)|de novo|ce mark|mdr|clearance|approval|clinical trial|clinical validation|registry|endpoint)/i.test(hay)) {
    return 'clinical_regulatory';
  }
  if (category === 'academic') return 'algorithm_evidence';
  if (/(api|sdk|developer|healthkit|workoutkit|health connect|health services|schema|permission|release notes|watchos|wear os)/i.test(hay)) {
    return 'platform_api';
  }
  if (/(funding|series [abc]|acquir|merger|partnership|ehr|insurance|subscription|reimbursement|business model)/i.test(hay)) {
    return 'business_structure';
  }
  if (category === 'academic' || category === 'company_research') return 'algorithm_evidence';
  return 'product_market';
}

async function fetchFeed(source) {
  const r = await httpGet(source.rssUrl);
  if (!r.ok) return { source, items: [], error: `HTTP ${r.status}${r.error ? ': ' + r.error : ''}` };
  try {
    return { source, items: parseFeed(r.text), error: null };
  } catch (err) {
    return { source, items: [], error: `parse: ${err.message}` };
  }
}

function openFdaDetailUrl(source, row) {
  const id = row[source.idField];
  if (source.kind === '510k' && id) {
    return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${encodeURIComponent(id)}`;
  }
  if (source.kind === 'pma' && id) {
    return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${encodeURIComponent(id)}`;
  }
  if (source.kind === 'recall' && id) {
    return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=${encodeURIComponent(id)}`;
  }
  return source.homeUrl;
}

function mapOpenFdaRow(source, row) {
  const id = row[source.idField] || null;
  const date = parseOpenFdaDate(row[source.dateField]);
  const company = row[source.companyField] || row.applicant || row.recalling_firm || '';
  const deviceName = row[source.deviceField] || row.device_name || row.trade_name || row.product_description || '';
  const decisionCode = row.decision_description || row.decision_code || row.supplement_type || null;
  const recallStatus = row.recall_status || null;
  const productCode = row.product_code || '';
  const titlePrefix = source.kind === 'recall'
    ? 'FDA device recall'
    : source.kind === 'pma'
      ? 'FDA PMA decision'
      : 'FDA 510(k) decision';
  const title = [
    titlePrefix,
    deviceName || source.name,
    company && `(${company})`
  ].filter(Boolean).join(' ');
  const summary = [
    id && `Regulatory ID: ${id}`,
    productCode && `Product code: ${productCode}`,
    decisionCode && `Decision: ${decisionCode}`,
    recallStatus && `Recall status: ${recallStatus}`,
    row.reason_for_recall && `Reason: ${row.reason_for_recall}`,
    row.generic_name && `Generic name: ${row.generic_name}`
  ].filter(Boolean).join(' | ');
  return {
    title,
    url: openFdaDetailUrl(source, row),
    publishedAt: date,
    summary: summary.slice(0, 2000),
    regulatoryId: id,
    company,
    deviceName,
    decisionCode,
    recallStatus
  };
}

async function fetchOpenFda(source, days) {
  const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const query = `search=${source.dateField}:[${formatOpenFdaDate(start)}+TO+${formatOpenFdaDate(end)}]`
    + `&sort=${source.dateField}:desc&limit=${source.limit || 100}`;
  const url = `${source.endpoint}?${query}`;

  const r = await httpGet(url, 20000);
  if (r.status === 404) return { source, items: [], error: null };
  if (!r.ok) return { source, items: [], error: `HTTP ${r.status}${r.error ? ': ' + r.error : ''}` };
  try {
    const data = JSON.parse(r.text);
    const items = (data.results || []).map(row => mapOpenFdaRow(source, row)).filter(it => it.title && it.url);
    return { source, items, error: null };
  } catch (err) {
    return { source, items: [], error: `parse: ${err.message}` };
  }
}

async function loadRemoteFeed(args, healthcheck) {
  if (args.noRemote) return null;
  if (existsSync(USER_CATALOG)) {
    healthcheck.warnings.push('User catalog override detected; skipped central feed so private sources can be fetched locally');
    return null;
  }
  const r = await httpGet(REMOTE_FEED, 10000);
  if (!r.ok) {
    healthcheck.warnings.push(`Remote feed fetch failed (status=${r.status})${r.error ? ': ' + r.error : ''}; falling back to local RSS`);
    return null;
  }
  try {
    return JSON.parse(r.text);
  } catch (err) {
    healthcheck.warnings.push(`Remote feed JSON invalid (${err.message}); falling back to local RSS`);
    return null;
  }
}

function categoryAllowed(itemCategory, categories) {
  if (categories.includes(itemCategory)) return true;
  // Retrieval bucket folds into Industry News for the section assignment.
  if (itemCategory === 'vendor_websearch' && categories.includes('industry_news')) return true;
  return false;
}

function buildFromRemoteFeed(feed, categories, windowDays, healthcheck) {
  healthcheck.feed_source = 'remote_feed';
  healthcheck.remote_feed_generated_at = feed.generatedAt || null;
  healthcheck.remote_feed_lookback_days = feed.lookbackDays || null;
  healthcheck.per_source = feed.healthcheck?.per_source || {};
  healthcheck.per_api_source = feed.healthcheck?.per_api_source || {};
  healthcheck.tavily_per_site = feed.healthcheck?.tavily_per_site || {};
  healthcheck.filtered_out_by_blacklist = feed.healthcheck?.filtered_out_by_blacklist || 0;
  healthcheck.filtered_out_by_keyword = feed.healthcheck?.filtered_out_by_keyword || 0;
  healthcheck.filtered_out_by_required_keyword = feed.healthcheck?.filtered_out_by_required_keyword || 0;
  healthcheck.filtered_out_by_source_exclude = feed.healthcheck?.filtered_out_by_source_exclude || 0;
  healthcheck.filtered_out_by_tavily_quality = feed.healthcheck?.filtered_out_by_tavily_quality || 0;
  healthcheck.filtered_out_by_date = feed.healthcheck?.filtered_out_by_date || 0;
  healthcheck.tavily_items_capped = feed.healthcheck?.tavily_items_capped || 0;
  healthcheck.top3_categories = null;
  healthcheck.top3_scores = null;
  healthcheck.top3_rejected_candidates = null;

  const allItems = [];
  let localFilteredByDate = 0;
  let localFilteredByCategory = 0;
  for (const it of feed.items || []) {
    if (!categoryAllowed(it.sourceCategory, categories)) {
      localFilteredByCategory++;
      continue;
    }
    if (!hasDateWindow(it, windowDays)) {
      localFilteredByDate++;
      continue;
    }
    allItems.push({
      ...it,
      publishedAt: normalizePublishedAt(it.publishedAt),
      signalType: it.signalType || inferSignalType(it)
    });
  }
  healthcheck.filtered_out_by_date += localFilteredByDate;
  healthcheck.filtered_out_by_category = localFilteredByCategory;
  return {
    items: allItems,
    stats: {
      rawItems: feed.stats?.rawItems || (feed.items || []).length,
      keptItems: allItems.length,
      sourcesQueried: feed.stats?.sourcesQueried || 0,
      sourcesWithResults: feed.stats?.sourcesWithResults || 0,
      sourcesFailed: feed.stats?.sourcesFailed || 0,
      apiSourcesQueried: feed.stats?.apiSourcesQueried || 0,
      apiSourcesWithResults: feed.stats?.apiSourcesWithResults || 0,
      apiSourcesFailed: feed.stats?.apiSourcesFailed || 0,
      tavilySitesQueried: feed.stats?.tavilySitesQueried || 0,
      tavilySitesWithResults: feed.stats?.tavilySitesWithResults || 0,
      tavilySitesFailed: feed.stats?.tavilySitesFailed || 0
    },
    keywordFilters: feed.keywordFilters || null,
    scarcityTaxonomy: feed.scarcityTaxonomy || null
  };
}

async function buildFromLocalRss(catalog, categories, windowDays, healthcheck) {
  healthcheck.feed_source = 'local_rss';
  const sources = [];
  for (const cat of categories) {
    for (const s of (catalog.primary_rss?.[cat] || [])) sources.push(s);
  }
  if (sources.length === 0) {
    healthcheck.warnings.push(`No primary_rss sources matched categories: ${categories.join(', ')}`);
  }

  const fetchResults = await Promise.all(sources.map(fetchFeed));
  const blacklistPatterns = catalog.title_blacklist?.patterns || [];
  const allItems = [];
  for (const { source, items, error } of fetchResults) {
    healthcheck.per_source[source.name] = { fetched: items.length, kept: 0, error };
    if (error) continue;

    for (const it of items) {
      if (!withinDays(it.publishedAt, windowDays)) {
        healthcheck.filtered_out_by_date++;
        continue;
      }
      if (!passesBlacklist(it.title, blacklistPatterns)) {
        healthcheck.filtered_out_by_blacklist++;
        continue;
      }
      if (source.keywordFilter && !passesKeywordFilter(it, source.keywordFilter, source.keywordScope)) {
        healthcheck.filtered_out_by_keyword++;
        continue;
      }
      if (source.requiredKeywordFilter && !passesRequiredKeywordFilter(it, source.requiredKeywordFilter, source.requiredKeywordScope || source.keywordScope)) {
        healthcheck.filtered_out_by_required_keyword++;
        continue;
      }
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_source_exclude++;
        continue;
      }
      const item = {
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'rss'
      };
      item.signalType = source.signalType || inferSignalType(item);
      allItems.push(item);
      healthcheck.per_source[source.name].kept++;
    }
  }

  const apiFetchers = [
    ...(catalog.api_sources?.openfda || [])
      .filter(source => categoryAllowed(source.category, categories))
      .map(source => ({ source, fetcher: s => fetchOpenFda(s, windowDays) }))
  ];
  const apiResults = await Promise.all(apiFetchers.map(({ source, fetcher }) => fetcher(source)));
  for (const { source, items, error } of apiResults) {
    healthcheck.per_api_source[source.name] = { fetched: items.length, kept: 0, error };
    if (error) continue;

    for (const it of items) {
      if (!withinDays(it.publishedAt, windowDays)) {
        healthcheck.filtered_out_by_date++;
        continue;
      }
      if (!passesBlacklist(it.title, blacklistPatterns)) {
        healthcheck.filtered_out_by_blacklist++;
        continue;
      }
      if (source.keywordFilter && !passesKeywordFilter(it, source.keywordFilter, source.keywordScope)) {
        healthcheck.filtered_out_by_keyword++;
        continue;
      }
      if (source.requiredKeywordFilter && !passesRequiredKeywordFilter(it, source.requiredKeywordFilter, source.requiredKeywordScope || source.keywordScope)) {
        healthcheck.filtered_out_by_required_keyword++;
        continue;
      }
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_source_exclude++;
        continue;
      }
      const item = {
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'api'
      };
      item.signalType = source.signalType || inferSignalType(item);
      allItems.push(item);
      healthcheck.per_api_source[source.name].kept++;
    }
  }

  return {
    items: allItems,
    stats: {
      rawItems: Object.values(healthcheck.per_source).reduce((s, x) => s + x.fetched, 0)
        + Object.values(healthcheck.per_api_source).reduce((s, x) => s + x.fetched, 0),
      keptItems: allItems.length,
      sourcesQueried: sources.length,
      sourcesWithResults: Object.values(healthcheck.per_source).filter(x => x.kept > 0).length,
      sourcesFailed: Object.values(healthcheck.per_source).filter(x => x.error).length,
      apiSourcesQueried: apiFetchers.length,
      apiSourcesWithResults: Object.values(healthcheck.per_api_source).filter(x => x.kept > 0).length,
      apiSourcesFailed: Object.values(healthcheck.per_api_source).filter(x => x.error).length,
      tavilySitesQueried: 0,
      tavilySitesWithResults: 0,
      tavilySitesFailed: 0
    },
    keywordFilters: null,
    scarcityTaxonomy: null
  };
}

async function main() {
  const args = parseArgs();
  const healthcheck = {
    catalog_source: null,
    feed_source: null,
    remote_catalog_version: null,
    remote_feed_generated_at: null,
    remote_feed_lookback_days: null,
    prompt_sources: {},
    warnings: [],
    per_source: {},
    per_api_source: {},
    tavily_per_site: {},
    filtered_out_by_blacklist: 0,
    filtered_out_by_keyword: 0,
    filtered_out_by_required_keyword: 0,
    filtered_out_by_source_exclude: 0,
    filtered_out_by_tavily_quality: 0,
    filtered_out_by_date: 0,
    filtered_out_by_category: 0,
    tavily_items_capped: 0,
    top3_categories: null,
    top3_scores: null,
    top3_rejected_candidates: null
  };

  const userCfg = await loadUserConfig(healthcheck);
  const config = {
    language: userCfg.language || 'en',
    windowDays: userCfg.windowDays || 30,
    categories: userCfg.categories == null ? DEFAULT_CATEGORIES : normalizeCategoryList(userCfg.categories, 'config.categories'),
    onboardingComplete: userCfg.onboardingComplete || false,
    firstRunShown: userCfg.firstRunShown || false
  };
  const windowDays = args.days || config.windowDays;
  const categories = args.categories || config.categories;

  const catalog = await loadCatalog(args.noRemote, healthcheck);
  const remoteFeed = await loadRemoteFeed(args, healthcheck);
  const sourceData = remoteFeed
    ? buildFromRemoteFeed(remoteFeed, categories, windowDays, healthcheck)
    : await buildFromLocalRss(catalog, categories, windowDays, healthcheck);
  healthcheck.stats = sourceData.stats;

  const allItems = sourceData.items.sort((a, b) => (parseDateMs(b.publishedAt) || 0) - (parseDateMs(a.publishedAt) || 0));
  const groupedByCategory = {};
  for (const it of allItems) (groupedByCategory[it.sourceCategory] ||= []).push(it);

  const prompts = {};
  for (const f of PROMPT_FILES) {
    const content = await loadPrompt(f, args.noRemote, healthcheck);
    const key = f.replace('.md', '').replace(/-/g, '_');
    if (content) prompts[key] = content;
  }

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    windowDays,
    config: {
      language: config.language,
      categories,
      firstRunShown: config.firstRunShown,
      onboardingComplete: config.onboardingComplete
    },
    stats: sourceData.stats,
    items: allItems,
    groupedByCategory,
    keywordFilters: sourceData.keywordFilters || catalog.keyword_filters || {},
    scarcityTaxonomy: sourceData.scarcityTaxonomy || catalog.scarcity_taxonomy || null,
    prompts,
    healthcheck
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message, stack: err.stack }));
  process.exit(1);
});
