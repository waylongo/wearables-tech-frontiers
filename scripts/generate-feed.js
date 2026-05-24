#!/usr/bin/env node

// ============================================================================
// Wearables Tech Frontiers — Central Feed Generator
// ============================================================================
// Runs on GitHub Actions to fetch RSS/Atom sources plus Tavily vendor-site
// fallback results, then publishes feed-wearables.json.
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const CATALOG_PATH = join(REPO_ROOT, 'config', 'sources.json');
const FEED_PATH = join(REPO_ROOT, 'feed-wearables.json');
const STATE_PATH = join(REPO_ROOT, 'state-feed.json');

const USER_AGENT = 'Mozilla/5.0 (wearables-tech-frontiers-feed/1.0)';
const DEFAULT_LOOKBACK_DAYS = 30;
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const CLINICAL_TRIALS_SEARCH_URL = 'https://clinicaltrials.gov/api/v2/studies';
const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const DAY_MS = 24 * 60 * 60 * 1000;
const TAVILY_MAX_RESULTS_PER_SITE = 10;
const SELECTED_MIN_TARGET = 35;
const SELECTED_MAX_TARGET = 55;
const SELECTION_THRESHOLDS = {
  default: 3.2,
  tavily: 3.5,
  vendor_websearch: 3.5,
  company_research: 3.5
};

function parseArgs() {
  const args = { rssOnly: false, days: DEFAULT_LOOKBACK_DAYS };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--rss-only') args.rssOnly = true;
    else if (arg.startsWith('--days=')) {
      const n = parseInt(arg.slice(7), 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        console.error(`--days must be an integer in [1, 365], got ${arg.slice(7)}`);
        process.exit(2);
      }
      args.days = n;
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
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    agrave: 'à',
    egrave: 'è',
    igrave: 'ì',
    ograve: 'ò',
    ugrave: 'ù',
    acirc: 'â',
    ecirc: 'ê',
    icirc: 'î',
    ocirc: 'ô',
    ucirc: 'û',
    atilde: 'ã',
    otilde: 'õ',
    auml: 'ä',
    euml: 'ë',
    iuml: 'ï',
    ouml: 'ö',
    uuml: 'ü',
    ntilde: 'ñ',
    ccedil: 'ç',
    ge: '>=',
    le: '<='
  };
  return (s || '')
    .replace(/&([a-z]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(named, key)) return m;
      const value = named[key];
      return /^[A-Z]/.test(name) && value.length === 1 ? value.toUpperCase() : value;
    })
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
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*'
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

function normalizePath(p) {
  if (!p) return '/';
  const prefixed = p.startsWith('/') ? p : `/${p}`;
  return prefixed.length > 1 && prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed;
}

function urlPathname(url) {
  try {
    return normalizePath(new URL(url).pathname.toLowerCase());
  } catch {
    return null;
  }
}

function passesUrlExcludeFilter(item, patterns) {
  if (!patterns?.length) return true;
  const hay = `${item.url || ''}`.toLowerCase();
  const normalizedPath = urlPathname(item.url);
  return !patterns.some(pattern => {
    const p = String(pattern || '').toLowerCase();
    if (!p) return false;
    if (p.startsWith('path-prefix:')) {
      if (!normalizedPath) return false;
      const prefix = normalizePath(p.slice('path-prefix:'.length));
      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    }
    if (p.startsWith('path:')) {
      if (!normalizedPath) return false;
      return normalizedPath === normalizePath(p.slice('path:'.length));
    }
    return hay.includes(p);
  });
}

function isAllowedIncrementalDocPage(item) {
  const hay = `${item.title || ''} ${item.url || ''}`.toLowerCase();
  return /\b(change\s*log|changelog|release notes?|releases?|release-notes|api-changelog)\b/i.test(hay);
}

function passesEntryPageFilter(item) {
  if (isAllowedIncrementalDocPage(item)) return true;
  const title = (item.title || '').toLowerCase().replace(/[’‘]/g, "'");
  const hay = `${title} ${item.url || ''}`.toLowerCase();
  const entryPatterns = [
    /\bapi\s*\|\s*home\b/,
    /\bdeveloper docs?\b/,
    /\bapi docs?\b/,
    /\bpublic api\b/,
    /\bpartner hub\b/,
    /\bwhoop 101\b/,
    /\b101\b/,
    /\bconnect iq sdk\b/,
    /^(home|overview)$/i,
    /^(home|overview)\s*[|-]/i,
    /\s[|-]\s*(home|overview)$/i,
    /^[a-z0-9 &/+.-]+\s\|\s(?:[a-z0-9 ]+\s)?developers?$/i,
    /^[a-z0-9 &/+.-]+\s\|\s(?:[a-z0-9 ]+\s)?developer documentation$/i,
    // Newsroom / press hubs
    /^newsroom\b/,
    /\bnewsroom\s*[|\-–]/,
    /^press\s+(?:room|releases?|center|centre)\b/,
    /\bmedia\s+(?:room|center|centre)\b/,
    // User guides / manuals / help hubs
    /^user\s+(?:guide|manual)\b/,
    /\buser\s+(?:guide|manual)\s*[|\-–]/,
    /^help\s*(?:center|centre)?$/,
    /\bhelp\s*(?:center|centre)\s*[|\-–]/,
    /^(faq|frequently asked questions)$/,
    /^getting started\b/,
    /^quick start\b/,
    /^setup guide\b/,
    /^fetch data example\b/,
    /\bexamples?\s*[|\-–]/,
    /\b(?:api|data)\s+examples?\b/,
    /^(blog|search|research papers?)\s*[|\-–]/,
    // Account / data hubs
    /^raw data\b/,
    /\braw data\s*[|\-–]/,
    /^pulling .* manually\b/,
    /^my account\b/,
    /^(account|dashboard|sign in|log in|login)$/,
    // Brand/media asset pages
    /\b(?:brand|design)\s+guidelines\b/,
    /\busing our logo\b/,
    /\bwordmark\b/,
    /\bmedia kit\b/,
    // Apple Developer / SDK doc symbol pages
    /\|\s*apple developer documentation$/,
    /^[a-z][a-z0-9]*\([^)]*\)$/,
    /^(class|protocol|module|enum|struct|extension):\s/,
    /^index\(after:\)$/,
    // Generic docs hub roots
    /^api reference\b/,
    /^glossary\b/,
    /\bglossary\s*[|\-–]/,
    /^reference index\b/,
    /^developer documentation\b/,
    /^documentation (home|archive|center|centre)$/,
    /^sdk overview$/,
    /^developer hub$/
  ];
  const entryHayPatterns = [
    /\/(?:developer|integration)-guide\/.*(?:example|sample|tutorial|getting-started|quickstart)/,
    /\/(?:examples?|samples?|tutorials?)\//
  ];
  return !entryPatterns.some(re => re.test(title)) && !entryHayPatterns.some(re => re.test(hay));
}

function passesTavilySummaryQuality(item) {
  const summary = item.summary || '';
  const markdownLinks = summary.match(/\[[^\]]+\]\([^)]+\)/g) || [];
  if (markdownLinks.length >= 5) return false;
  const compact = summary.toLowerCase().replace(/\s+/g, ' ');
  if (compact.startsWith('* [store]') && compact.includes('shop the latest')) return false;
  if (compact.startsWith('* store') && compact.includes('shop the latest')) return false;
  return true;
}

function cleanTavilySummary(s) {
  let out = stripTags(decodeEntities(s || ''))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\+\s+the girl.?s sports gear i use list\.\s*/i, '')
    .replace(/^\s*#+\s*/, '');
  for (let i = 0; i < 3 && /^image of\b/i.test(out); i++) {
    const next = out.replace(/^image of[^.]{0,240}\.\s*/i, '');
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function cleanTextField(value, maxLength) {
  const out = stripTags(decodeEntities(value || ''))
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return maxLength ? out.slice(0, maxLength) : out;
}

function normalizeOutputItem(item) {
  return {
    ...item,
    title: cleanTextField(item.title, 500),
    summary: cleanTextField(item.summary, 2000)
  };
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
  const titleBits = [
    titlePrefix,
    deviceName || source.name,
    company && `(${company})`
  ].filter(Boolean);
  const summaryParts = [
    id && `Regulatory ID: ${id}`,
    productCode && `Product code: ${productCode}`,
    decisionCode && `Decision: ${decisionCode}`,
    recallStatus && `Recall status: ${recallStatus}`,
    row.reason_for_recall && `Reason: ${row.reason_for_recall}`,
    row.generic_name && `Generic name: ${row.generic_name}`
  ].filter(Boolean);
  return {
    title: titleBits.join(' '),
    url: openFdaDetailUrl(source, row),
    publishedAt: date,
    summary: summaryParts.join(' | ').slice(0, 2000),
    regulatoryId: id,
    company,
    deviceName,
    decisionCode,
    recallStatus
  };
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

async function fetchClinicalTrials(source) {
  const url = new URL(CLINICAL_TRIALS_SEARCH_URL);
  url.searchParams.set('query.term', source.query);
  url.searchParams.set('pageSize', '25');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'LastUpdatePostDate:desc');
  const r = await httpGet(url.toString(), 20000);
  if (!r.ok) return { source, items: [], error: `HTTP ${r.status}${r.error ? ': ' + r.error : ''}` };
  try {
    const data = JSON.parse(r.text);
    const items = (data.studies || []).map(study => {
      const p = study.protocolSection || {};
      const id = p.identificationModule?.nctId;
      const title = p.identificationModule?.briefTitle;
      if (!id || !title) return null;
      const updated = p.statusModule?.lastUpdatePostDateStruct?.date || p.statusModule?.lastUpdateSubmitDate || null;
      const status = p.statusModule?.overallStatus || '';
      const conditions = (p.conditionsModule?.conditions || []).slice(0, 5).join('; ');
      const interventions = (p.armsInterventionsModule?.interventions || [])
        .map(x => x.name)
        .filter(Boolean)
        .slice(0, 5)
        .join('; ');
      const phases = (p.designModule?.phases || []).join(', ');
      const briefSummary = p.descriptionModule?.briefSummary || '';
      const primaryOutcomes = (p.outcomesModule?.primaryOutcomes || [])
        .map(x => [x.measure, x.description].filter(Boolean).join(': '))
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');
      const secondaryOutcomes = (p.outcomesModule?.secondaryOutcomes || [])
        .map(x => [x.measure, x.description].filter(Boolean).join(': '))
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');
      const summaryParts = [
        status && `Status: ${status}`,
        conditions && `Conditions: ${conditions}`,
        interventions && `Interventions: ${interventions}`,
        phases && `Phase: ${phases}`,
        primaryOutcomes && `Primary outcomes: ${primaryOutcomes}`,
        secondaryOutcomes && `Secondary outcomes: ${secondaryOutcomes}`,
        briefSummary && `Summary: ${briefSummary}`
      ].filter(Boolean);
      return {
        title,
        url: `https://clinicaltrials.gov/study/${id}`,
        publishedAt: normalizePublishedAt(updated),
        summary: summaryParts.join(' | '),
        nctId: id
      };
    }).filter(Boolean);
    return { source, items, error: null };
  } catch (err) {
    return { source, items: [], error: `parse: ${err.message}` };
  }
}

async function fetchPubMed(source) {
  const searchUrl = new URL(PUBMED_SEARCH_URL);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', source.query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', '25');
  searchUrl.searchParams.set('sort', 'pub date');
  const search = await httpGet(searchUrl.toString(), 20000);
  if (!search.ok) return { source, items: [], error: `search HTTP ${search.status}${search.error ? ': ' + search.error : ''}` };

  try {
    const ids = JSON.parse(search.text).esearchresult?.idlist || [];
    if (ids.length === 0) return { source, items: [], error: null };

    const summaryUrl = new URL(PUBMED_SUMMARY_URL);
    summaryUrl.searchParams.set('db', 'pubmed');
    summaryUrl.searchParams.set('id', ids.join(','));
    summaryUrl.searchParams.set('retmode', 'json');
    const summary = await httpGet(summaryUrl.toString(), 20000);
    if (!summary.ok) return { source, items: [], error: `summary HTTP ${summary.status}${summary.error ? ': ' + summary.error : ''}` };
    const data = JSON.parse(summary.text).result || {};
    const items = ids.map(id => {
      const row = data[id];
      if (!row?.title) return null;
      const authors = (row.authors || []).map(a => a.name).filter(Boolean).slice(0, 4).join(', ');
      const summaryParts = [
        row.source && `Journal: ${row.source}`,
        authors && `Authors: ${authors}`,
        row.pubdate && `Published: ${row.pubdate}`
      ].filter(Boolean);
      return {
        title: row.title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        publishedAt: normalizePublishedAt(row.pubdate),
        summary: summaryParts.join(' | '),
        pmid: id
      };
    }).filter(Boolean);
    return { source, items, error: null };
  } catch (err) {
    return { source, items: [], error: `parse: ${err.message}` };
  }
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

function tavilyDomain(site) {
  const siteMatches = [...(site.query || '').matchAll(/site:([^\s)]+)/g)];
  if (siteMatches.length > 0) {
    return siteMatches.map(m => m[1].replace(/^www\./, ''));
  }
  try {
    return [new URL(site.homeUrl).hostname.replace(/^www\./, '')];
  } catch {
    return [];
  }
}

function tavilyQuery(site) {
  return (site.query || '')
    .replace(/site:[^\s)]+/g, '')
    .replace(/\s+OR\s+site:[^\s)]+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(OR|AND)\s+/i, '')
    .trim();
}

function tavilyTimeRange(days) {
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'year';
}

function inferPublicationYear(item) {
  const hay = `${item.title || ''}\n${item.summary || ''}\n${item.url || ''}`;
  const patterns = [
    /\bpublished in:\s*(\d{4})\b/i,
    /\bdate of conference:\s*[^.\n]*\b(20\d{2})\b/i,
    /\b(20\d{2})\s+IEEE\b/i,
    /\b(20\d{2})\s+ACM\b/i,
    /\b(?:NeurIPS|ICML|EMBC|BIBM|ISWC|UbiComp|IMWUT)\s*(20\d{2})\b/i,
    /(?:^|[\/_-])(20\d{2})(?:[\/_-]|$)/i,
    /\b(?:q[1-4][\s-]*)?(20\d{2})\b/i
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function passesTavilyFreshness(item, site, days) {
  if (item.publishedAt) return withinDays(item.publishedAt, days);
  if (!site.requireRecentYear) return true;
  const year = inferPublicationYear(item);
  if (!year) return true;
  return year === new Date().getUTCFullYear();
}

async function fetchTavilySite(site, apiKey, days) {
  const domains = tavilyDomain(site);
  const query = tavilyQuery(site);
  if (!domains.length || !query) return { site, items: [], error: 'missing domain or query' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query,
        include_domains: domains,
        time_range: tavilyTimeRange(days),
        search_depth: 'basic',
        max_results: TAVILY_MAX_RESULTS_PER_SITE,
        include_answer: false,
        include_raw_content: false
      })
    });
    if (!res.ok) return { site, items: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const items = (data.results || []).slice(0, TAVILY_MAX_RESULTS_PER_SITE).map(r => ({
      title: (r.title || '').slice(0, 500),
      url: r.url,
      publishedAt: normalizePublishedAt(r.published_date),
      summary: cleanTavilySummary(r.content || r.snippet || '').slice(0, 2000),
      score: r.score
    })).filter(it => it.title && it.url);
    return { site, items, error: null };
  } catch (err) {
    return { site, items: [], error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return { urls: {} };
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
    if (!state.urls) state.urls = {};
    return state;
  } catch {
    return { urls: {} };
  }
}

async function saveState(state, items) {
  const now = Date.now();
  for (const item of items) {
    const prev = state.urls[item.url] || {};
    state.urls[item.url] = {
      firstSeen: prev.firstSeen || now,
      lastSeen: now,
      sourceName: item.sourceName,
      sourceCategory: item.sourceCategory
    };
  }
  const cutoff = now - 60 * 24 * 60 * 60 * 1000;
  for (const [url, meta] of Object.entries(state.urls)) {
    if ((meta.lastSeen || 0) < cutoff) delete state.urls[url];
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

function canonicalUrlForDedupe(url) {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '');
    u.hash = '';
    const host = u.hostname;
    if (host === 'ieeexplore.ieee.org') {
      const m = u.pathname.match(/^\/(?:abstract\/)?document\/(\d+)/);
      if (m) {
        u.pathname = `/document/${m[1]}`;
        u.search = '';
      }
    }
    if (host === 'dl.acm.org') {
      u.pathname = u.pathname.replace(/^\/doi\/(?:abs|pdf)\//, '/doi/');
      u.search = '';
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    return String(url).replace(/^http:\/\//, 'https://').replace(/^https:\/\/www\./, 'https://').replace(/\/+$/, '');
  }
}

function normalizedTitleForDedupe(item) {
  return `${item.sourceName || ''}|${item.title || ''}`
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pushUnique(items, item, seenUrls, seenTitles) {
  if (!item.url) return false;
  const key = canonicalUrlForDedupe(item.url);
  if (seenUrls.has(key)) return 'duplicate_url';
  const titleKey = normalizedTitleForDedupe(item);
  if (titleKey && seenTitles.has(titleKey)) return 'duplicate_title';
  seenUrls.add(key);
  if (titleKey) seenTitles.add(titleKey);
  items.push(item);
  return 'pushed';
}

const SCORING_RELEVANCE_TERMS = [
  'healthkit',
  'workoutkit',
  'health connect',
  'health services',
  'wear os',
  'samsung health',
  'huawei health',
  'connect iq',
  'galaxy ring',
  'smart ring',
  'smart rings',
  'coros',
  'suunto',
  'polar',
  'wahoo',
  'earable',
  'earables',
  'blood pressure',
  'blood glucose',
  'glucose monitor',
  'arrhythmia',
  'afib',
  'sleep apnea',
  'recovery score',
  'strain',
  'body battery',
  'vitals',
  'respiratory rate'
];

function uniqueMatches(text, keywords) {
  const out = [];
  const seen = new Set();
  for (const keyword of keywords || []) {
    const normalized = normalizeFilterText(keyword);
    if (!normalized || seen.has(normalized)) continue;
    if (keywordMatches(text, normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function addScore(ctx, points, reason) {
  ctx.score += points;
  ctx.reasons.push(`${reason} +${points.toFixed(1)}`);
}

function subtractScore(ctx, points, reason) {
  ctx.score -= points;
  ctx.penalties.push(`${reason} -${points.toFixed(1)}`);
}

function sourcePriorityScore(priority) {
  const p = String(priority || '').toUpperCase();
  if (p === 'P0') return 0.8;
  if (p === 'P1') return 0.5;
  if (p === 'P2') return 0.2;
  return 0.3;
}

function recencyScore(item) {
  const ms = parseDateMs(item.publishedAt);
  if (ms == null) return null;
  const ageDays = (Date.now() - ms) / DAY_MS;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 14) return 0.5;
  if (ageDays <= 30) return 0.2;
  return 0;
}

function hasLocalizedMirrorPath(item) {
  const pathname = urlPathname(item.url);
  if (!pathname) return false;
  const first = pathname.split('/').filter(Boolean)[0] || '';
  if (!first) return false;
  return /^[a-z]{2}(?:[_-][a-z]{2})?$/.test(first)
    && !['api', 'app', 'blog', 'docs', 'help', 'news', 'press', 'shop'].includes(first);
}

function scoreCandidate(item, catalog) {
  const title = normalizeFilterText(item.title || '');
  const summary = normalizeFilterText(item.summary || '');
  const urlText = normalizeFilterText(item.url || '');
  const hay = `${title} ${summary}`;
  const titleUrl = `${title} ${urlText}`;
  const ctx = { score: 0, reasons: [], penalties: [] };

  const categoryScores = {
    clinical_regulatory: 2.2,
    academic: 1.8,
    company_research: 1.2,
    industry_news: 1.2,
    vendor_websearch: 0.8
  };
  addScore(ctx, categoryScores[item.sourceCategory] ?? 0.8, `category:${item.sourceCategory || 'unknown'}`);

  const retrievalScores = { api: 0.8, rss: 0.7, tavily: 0.3 };
  addScore(ctx, retrievalScores[item.retrievalMethod] ?? 0.4, `retrieval:${item.retrievalMethod || 'unknown'}`);

  addScore(ctx, sourcePriorityScore(item.sourcePriority), `priority:${item.sourcePriority || 'default'}`);

  const signalScores = {
    clinical_regulatory: 1.4,
    algorithm_evidence: 1.1,
    platform_api: 1.0,
    business_structure: 0.8,
    product_market: 0.5
  };
  addScore(ctx, signalScores[item.signalType] ?? 0.4, `signal:${item.signalType || 'unknown'}`);

  const relevanceKeywords = [
    ...(catalog.keyword_filters?.wearables_en || []),
    ...SCORING_RELEVANCE_TERMS
  ];
  const titleMatches = uniqueMatches(title, relevanceKeywords);
  const bodyMatches = uniqueMatches(summary, relevanceKeywords);
  const relevanceScore = Math.min(2.4, titleMatches.length * 0.75 + bodyMatches.length * 0.25);
  if (relevanceScore > 0) addScore(ctx, relevanceScore, `relevance:${[...new Set([...titleMatches, ...bodyMatches])].slice(0, 5).join(',')}`);

  if (/\b(fda|510\(k\)|510k|de novo|pma|clearance|cleared|approval|recall|medwatch|clinical trial|nct\d+|clinical validation|validated clinically|endpoint)\b/i.test(hay)) {
    addScore(ctx, 1.0, 'clinical/regulatory evidence');
  }
  if (/\b(api|sdk|changelog|change log|release notes?|breaking changes?|schema|permission|permissions|scope|oauth|webhook|endpoint|healthkit|health connect|wear os|connect iq)\b/i.test(hay)) {
    addScore(ctx, 0.9, 'platform/api signal');
  }
  if (/\b(peer[- ]reviewed|doi:|validation|validated|prospective|randomi[sz]ed|cohort|dataset|foundation model|self-supervised|benchmark|sensitivity|specificity|n\s*[=>=]\s*\d+)/i.test(hay)) {
    addScore(ctx, 0.9, 'evidence/method detail');
  }
  if (/\b(partnership|partners?|collaboration|acquir|acquisition|merger|ipo|funding|raises?|series [abc]|reimbursement|insurance|ehr)\b/i.test(hay)) {
    addScore(ctx, 0.7, 'market/business signal');
  }
  if (/\b(wearable sensors?|smartwatch|smart watch|smart ring|wrist[- ]worn|biosignal|digital biomarkers?|algorithm|sensor fusion|ppg|photoplethysmography|ecg|ekg|cgm|glucose|spo2|hrv|imu|accelerometer|gyroscope|actigraphy|arrhythmia|afib|sleep staging|blood pressure)\b/i.test(hay)) {
    addScore(ctx, 0.7, 'wearable sensor/algorithm specificity');
  }
  if (/\b(launch|launches|announces|introducing|rolls out|expands|ships|released?)\b/i.test(hay) && (titleMatches.length > 0 || bodyMatches.length > 0)) {
    addScore(ctx, 0.5, 'shipping/product signal');
  }

  const recency = recencyScore(item);
  if (recency == null) {
    subtractScore(ctx, item.retrievalMethod === 'tavily' ? 1.0 : 0.4, item.retrievalMethod === 'tavily' ? 'missing tavily publication date' : 'missing publication date');
    const inferredYear = inferPublicationYear(item);
    const currentYear = new Date().getUTCFullYear();
    if (inferredYear && inferredYear < currentYear) {
      subtractScore(ctx, 1.2, 'stale inferred publication year');
    }
  } else if (recency > 0) {
    addScore(ctx, recency, 'recency');
  }

  if (Number.isFinite(item.score)) {
    addScore(ctx, Math.min(0.5, Math.max(0, item.score) * 0.5), 'tavily rank');
  }

  if (hasLocalizedMirrorPath(item)) {
    subtractScore(ctx, 1.2, 'regional/localized mirror path');
  }
  if (/\b(podcast|webinar|episode|first impressions?|hands[- ]on|in[- ]depth review|reviewed[- ]by|reviewer profile|author profile|review|comparison|versus|vs\.?|feature differences|detailed comparison)\b/i.test(titleUrl)) {
    subtractScore(ctx, 1.1, 'podcast/review/comparison content');
  }
  if (/\b(best|tips?|guide to|guide|how to|what is|what .* measures|how .* measures|101|learn|explained|beginner|science-backed tips|bad night's sleep|readiness score|recovery activities|member averages|self-experimentation|visualize your|track progress|inside look|what's next)\b/i.test(titleUrl)) {
    subtractScore(ctx, 1.0, 'evergreen/help-style content');
  }
  if (/\b(deals?|coupon|discount|purchase eligible|free with|smart scale on us|limited edition|special edition|pride collection|track your health in real time|built for .* life stage|care companion)\b/i.test(hay)) {
    subtractScore(ctx, 0.8, 'promotional content');
  }
  if (/\b(world[- ]first|first[- ]ever|breakthrough|revolutionary|ultimate|transforming|game[- ]changing|all[- ]new|next[- ]generation)\b/i.test(hay)) {
    subtractScore(ctx, 0.8, 'marketing/hype language');
  }

  const hasWearableSpecificity = titleMatches.length > 0
    || bodyMatches.length > 0
    || /\b(wearable|watch|ring|tracker|sensor|ppg|ecg|ekg|hrv|spo2|cgm|imu|actigraphy|biosignal|biomarker)\b/i.test(hay);
  if (!hasWearableSpecificity && ['company_research', 'industry_news', 'vendor_websearch'].includes(item.sourceCategory)) {
    subtractScore(ctx, 1.2, 'weak wearable specificity');
  }

  return {
    selectionScore: Math.round(ctx.score * 10) / 10,
    selectionReasons: ctx.reasons,
    selectionPenalties: ctx.penalties
  };
}

function minimumSelectionScore(item) {
  if (item.retrievalMethod === 'tavily') return SELECTION_THRESHOLDS.tavily;
  if (item.sourceCategory === 'vendor_websearch') return SELECTION_THRESHOLDS.vendor_websearch;
  if (item.sourceCategory === 'company_research') return SELECTION_THRESHOLDS.company_research;
  return SELECTION_THRESHOLDS.default;
}

function sortForSelection(a, b) {
  const scoreDelta = (b.selectionScore || 0) - (a.selectionScore || 0);
  if (scoreDelta !== 0) return scoreDelta;
  return (parseDateMs(b.publishedAt) || 0) - (parseDateMs(a.publishedAt) || 0);
}

function sortForOutput(a, b) {
  return (parseDateMs(b.publishedAt) || 0) - (parseDateMs(a.publishedAt) || 0)
    || (b.selectionScore || 0) - (a.selectionScore || 0);
}

function nearDuplicateTitleKey(item) {
  const words = normalizeFilterText(item.title || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\b(?:samsung|apple|google|fitbit|whoop|oura|garmin|dexcom|newsroom|global|canada|philippines)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 5) return null;
  return words.slice(0, 5).join(' ');
}

function selectCandidates(candidates, healthcheck) {
  const selected = [];
  const selectedByTavilySite = {};
  const selectedTitleFingerprints = new Set();
  const scored = candidates.map(item => ({ ...item }));
  for (const item of scored.sort(sortForSelection)) {
    const threshold = minimumSelectionScore(item);
    item.selectionThreshold = threshold;
    if ((item.selectionScore || 0) < threshold) {
      item.selectionStatus = 'below_score';
      item.selectionDetail = `score ${item.selectionScore || 0} below threshold ${threshold}`;
      continue;
    }
    if (selected.length >= SELECTED_MAX_TARGET) {
      item.selectionStatus = 'pool_cap';
      item.selectionDetail = `selection pool cap ${SELECTED_MAX_TARGET} reached`;
      continue;
    }
    const titleFingerprint = nearDuplicateTitleKey(item);
    if (titleFingerprint && selectedTitleFingerprints.has(titleFingerprint)) {
      item.selectionStatus = 'near_duplicate_title';
      item.selectionDetail = `near duplicate title fingerprint: ${titleFingerprint}`;
      healthcheck.duplicate_titles++;
      continue;
    }
    if (item.retrievalMethod === 'tavily') {
      const maxItems = Number.isFinite(item.sourceMaxItems) ? item.sourceMaxItems : 2;
      const keptForSite = selectedByTavilySite[item.sourceName] || 0;
      if (keptForSite >= maxItems) {
        item.selectionStatus = 'source_cap';
        item.selectionDetail = `${item.sourceName} cap ${maxItems} reached`;
        healthcheck.tavily_per_site[item.sourceName].capped++;
        healthcheck.tavily_items_capped++;
        continue;
      }
      selectedByTavilySite[item.sourceName] = keptForSite + 1;
    }
    item.selectionStatus = 'selected';
    item.selectionDetail = `score ${item.selectionScore || 0} met threshold ${threshold}`;
    if (titleFingerprint) selectedTitleFingerprints.add(titleFingerprint);
    selected.push(item);
  }
  return { selected: selected.sort(sortForOutput), candidates: scored };
}

function incrementSelectedSourceCount(item, healthcheck) {
  if (item.retrievalMethod === 'rss') {
    if (healthcheck.per_source[item.sourceName]) healthcheck.per_source[item.sourceName].kept++;
  } else if (item.retrievalMethod === 'api') {
    if (healthcheck.per_api_source[item.sourceName]) healthcheck.per_api_source[item.sourceName].kept++;
  } else if (item.retrievalMethod === 'tavily') {
    if (healthcheck.tavily_per_site[item.sourceName]) {
      healthcheck.tavily_per_site[item.sourceName].finalKept++;
      healthcheck.tavily_per_site[item.sourceName].kept++;
    }
  }
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function incrementMap(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function recordHardFilter(healthcheck, retrievalMethod, sourceName, reason) {
  const stats = healthcheck.rejectedStats;
  if (!stats) return;
  stats.total++;
  incrementMap(stats.byReason, reason || 'unknown');
  incrementMap(stats.byRetrieval, retrievalMethod || 'unknown');
  incrementMap(stats.bySource, sourceName || 'unknown');
  incrementMap(stats.bySourceReason, `${sourceName || 'unknown'}|${reason || 'unknown'}`);
}

function buildCandidateStats(candidates, selected) {
  return {
    candidateItems: candidates.length,
    selectedItems: selected.length,
    targetMin: SELECTED_MIN_TARGET,
    targetMax: SELECTED_MAX_TARGET,
    thresholds: SELECTION_THRESHOLDS,
    byStatus: countBy(candidates, item => item.selectionStatus),
    byRetrieval: countBy(candidates, item => item.retrievalMethod),
    selectedByRetrieval: countBy(selected, item => item.retrievalMethod),
    byCategory: countBy(candidates, item => item.sourceCategory),
    selectedByCategory: countBy(selected, item => item.sourceCategory)
  };
}

function candidateReviewItem(item) {
  return {
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: cleanTextField(item.summary, 500),
    sourceName: item.sourceName,
    sourceCategory: item.sourceCategory,
    retrievalMethod: item.retrievalMethod,
    signalType: item.signalType,
    sourcePriority: item.sourcePriority,
    selectionScore: item.selectionScore,
    selectionThreshold: item.selectionThreshold,
    selectionStatus: item.selectionStatus,
    selectionDetail: item.selectionDetail,
    selectionReasons: item.selectionReasons,
    selectionPenalties: item.selectionPenalties,
    score: item.score || null
  };
}

function selectedFeedItem(item) {
  const {
    sourceMaxItems,
    selectionThreshold,
    selectionStatus,
    selectionDetail,
    selectionReasons,
    selectionPenalties,
    ...out
  } = item;
  return out;
}

async function main() {
  const args = parseArgs();
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf-8'));
  const blacklistPatterns = catalog.title_blacklist?.patterns || [];
  const healthcheck = {
    catalog_source: 'local_repo',
    remote_catalog_version: catalog.generatedAt || null,
    warnings: [],
    per_source: {},
    per_api_source: {},
    tavily_per_site: {},
    filtered_out_by_blacklist: 0,
    filtered_out_by_keyword: 0,
    filtered_out_by_source_exclude: 0,
    filtered_out_by_tavily_quality: 0,
    filtered_out_by_required_keyword: 0,
    filtered_out_by_entry_page: 0,
    filtered_out_by_date: 0,
    duplicate_urls: 0,
    duplicate_titles: 0,
    tavily_items_capped: 0,
    rejectedStats: {
      total: 0,
      byReason: {},
      byRetrieval: {},
      bySource: {},
      bySourceReason: {}
    },
    top3_categories: null,
    top3_scores: null,
    top3_rejected_candidates: null
  };

  const sources = Object.values(catalog.primary_rss || {}).flat();
  const rssResults = await Promise.all(sources.map(fetchFeed));
  const candidatePool = [];
  const seenUrls = new Set();
  const seenTitles = new Set();

  for (const { source, items: sourceItems, error } of rssResults) {
    healthcheck.per_source[source.name] = { fetched: sourceItems.length, candidates: 0, kept: 0, error };
    if (error) continue;
    for (const it of sourceItems) {
      if (!withinDays(it.publishedAt, args.days)) {
        healthcheck.filtered_out_by_date++;
        recordHardFilter(healthcheck, 'rss', source.name, 'date');
        continue;
      }
      if (!passesBlacklist(it.title, blacklistPatterns)) {
        healthcheck.filtered_out_by_blacklist++;
        recordHardFilter(healthcheck, 'rss', source.name, 'blacklist');
        continue;
      }
      if (source.keywordFilter && !passesKeywordFilter(it, source.keywordFilter, source.keywordScope)) {
        healthcheck.filtered_out_by_keyword++;
        recordHardFilter(healthcheck, 'rss', source.name, 'keyword');
        continue;
      }
      if (source.requiredKeywordFilter && !passesRequiredKeywordFilter(it, source.requiredKeywordFilter, source.requiredKeywordScope || source.keywordScope)) {
        healthcheck.filtered_out_by_required_keyword++;
        recordHardFilter(healthcheck, 'rss', source.name, 'required_keyword');
        continue;
      }
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_source_exclude++;
        recordHardFilter(healthcheck, 'rss', source.name, 'source_exclude');
        continue;
      }
      const candidate = normalizeOutputItem({
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'rss',
        signalType: inferSignalType({ ...it, sourceName: source.name, sourceCategory: source.category })
      });
      Object.assign(candidate, scoreCandidate(candidate, catalog));
      const pushed = pushUnique(candidatePool, candidate, seenUrls, seenTitles);
      if (pushed === 'pushed') healthcheck.per_source[source.name].candidates++;
      else if (pushed === 'duplicate_title') {
        healthcheck.duplicate_titles++;
        recordHardFilter(healthcheck, 'rss', source.name, 'duplicate_title');
      } else {
        healthcheck.duplicate_urls++;
        recordHardFilter(healthcheck, 'rss', source.name, 'duplicate_url');
      }
    }
  }

  const apiFetchers = [
    ...(catalog.api_sources?.pubmed || []).map(source => ({ source, fetcher: fetchPubMed })),
    ...(catalog.api_sources?.clinical_trials || []).map(source => ({ source, fetcher: fetchClinicalTrials })),
    ...(catalog.api_sources?.openfda || []).map(source => ({ source, fetcher: s => fetchOpenFda(s, args.days) }))
  ];
  const apiResults = await Promise.all(apiFetchers.map(({ source, fetcher }) => fetcher(source)));
  for (const { source, items: sourceItems, error } of apiResults) {
    healthcheck.per_api_source[source.name] = { fetched: sourceItems.length, candidates: 0, kept: 0, error };
    if (error) continue;
    for (const it of sourceItems) {
      if (!withinDays(it.publishedAt, args.days)) {
        healthcheck.filtered_out_by_date++;
        recordHardFilter(healthcheck, 'api', source.name, 'date');
        continue;
      }
      if (!passesBlacklist(it.title, blacklistPatterns)) {
        healthcheck.filtered_out_by_blacklist++;
        recordHardFilter(healthcheck, 'api', source.name, 'blacklist');
        continue;
      }
      if (source.keywordFilter && !passesKeywordFilter(it, source.keywordFilter, source.keywordScope)) {
        healthcheck.filtered_out_by_keyword++;
        recordHardFilter(healthcheck, 'api', source.name, 'keyword');
        continue;
      }
      if (source.requiredKeywordFilter && !passesRequiredKeywordFilter(it, source.requiredKeywordFilter, source.requiredKeywordScope || source.keywordScope)) {
        healthcheck.filtered_out_by_required_keyword++;
        recordHardFilter(healthcheck, 'api', source.name, 'required_keyword');
        continue;
      }
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_source_exclude++;
        recordHardFilter(healthcheck, 'api', source.name, 'source_exclude');
        continue;
      }
      const candidate = normalizeOutputItem({
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'api'
      });
      candidate.signalType = source.signalType || inferSignalType(candidate);
      Object.assign(candidate, scoreCandidate(candidate, catalog));
      const pushed = pushUnique(candidatePool, candidate, seenUrls, seenTitles);
      if (pushed === 'pushed') healthcheck.per_api_source[source.name].candidates++;
      else if (pushed === 'duplicate_title') {
        healthcheck.duplicate_titles++;
        recordHardFilter(healthcheck, 'api', source.name, 'duplicate_title');
      } else {
        healthcheck.duplicate_urls++;
        recordHardFilter(healthcheck, 'api', source.name, 'duplicate_url');
      }
    }
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const tavilySites = catalog.websearch_sites?.sites || [];
  if (args.rssOnly) {
    healthcheck.warnings.push('Tavily skipped because --rss-only was set');
  } else if (!tavilyKey) {
    healthcheck.warnings.push('TAVILY_API_KEY not set; skipped vendor websearch fallback');
  } else {
    const tavilyResults = await Promise.all(tavilySites.map(site => fetchTavilySite(site, tavilyKey, args.days)));
    for (const { site, items: siteItems, error } of tavilyResults) {
      healthcheck.tavily_per_site[site.name] = { fetched: siteItems.length, qualityKept: 0, finalKept: 0, kept: 0, capped: 0, error };
      if (error) continue;
      const maxItems = Number.isFinite(site.maxItems) ? site.maxItems : 2;
      for (const it of siteItems) {
        if (!passesBlacklist(it.title, blacklistPatterns)) {
          healthcheck.filtered_out_by_blacklist++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'blacklist');
          continue;
        }
        if (site.keywordFilter && !passesKeywordFilter(it, site.keywordFilter, site.keywordScope)) {
          healthcheck.filtered_out_by_tavily_quality++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'keyword');
          continue;
        }
        if (site.requiredKeywordFilter && !passesRequiredKeywordFilter(it, site.requiredKeywordFilter, site.requiredKeywordScope || site.keywordScope)) {
          healthcheck.filtered_out_by_required_keyword++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'required_keyword');
          continue;
        }
        const tavilyExclude = [
          ...(catalog.websearch_sites?.excludeKeywordFilter || []),
          ...(site.excludeKeywordFilter || [])
        ];
        if (!passesSourceExcludeFilter(it, tavilyExclude)) {
          healthcheck.filtered_out_by_tavily_quality++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'source_exclude');
          continue;
        }
        const urlExclude = [
          ...(catalog.websearch_sites?.urlExcludeFilter || []),
          ...(site.urlExcludeFilter || [])
        ];
        if (!passesUrlExcludeFilter(it, urlExclude)) {
          healthcheck.filtered_out_by_tavily_quality++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'url_exclude');
          continue;
        }
        if (!passesEntryPageFilter(it)) {
          healthcheck.filtered_out_by_entry_page++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'entry_page');
          continue;
        }
        if (!passesTavilySummaryQuality(it)) {
          healthcheck.filtered_out_by_tavily_quality++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'summary_quality');
          continue;
        }
        if (!passesTavilyFreshness(it, site, args.days)) {
          healthcheck.filtered_out_by_date++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'date');
          continue;
        }
        const candidate = normalizeOutputItem({
          title: it.title,
          url: it.url,
          publishedAt: it.publishedAt,
          summary: it.summary,
          sourceName: site.name,
          sourceCategory: site.sourceCategory || 'vendor_websearch',
          sourcePriority: site.priority || 'P1',
          sourceLang: 'en',
          retrievalMethod: 'tavily',
          score: it.score || null,
          sourceMaxItems: maxItems,
          signalType: site.signalType || inferSignalType({
            title: it.title,
            summary: it.summary,
            sourceName: site.name,
            sourceCategory: site.sourceCategory || 'vendor_websearch'
          })
        });
        Object.assign(candidate, scoreCandidate(candidate, catalog));
        const pushed = pushUnique(candidatePool, candidate, seenUrls, seenTitles);
        if (pushed === 'pushed') healthcheck.tavily_per_site[site.name].qualityKept++;
        else if (pushed === 'duplicate_title') {
          healthcheck.duplicate_titles++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'duplicate_title');
        } else {
          healthcheck.duplicate_urls++;
          recordHardFilter(healthcheck, 'tavily', site.name, 'duplicate_url');
        }
      }
    }
  }

  const { selected, candidates } = selectCandidates(candidatePool, healthcheck);
  for (const item of selected) incrementSelectedSourceCount(item, healthcheck);
  const items = selected.map(selectedFeedItem);
  healthcheck.candidate_items = candidates.length;
  healthcheck.selected_items = items.length;
  const groupedByCategory = {};
  for (const item of items) (groupedByCategory[item.sourceCategory] ||= []).push(item);

  const state = await loadState();
  await saveState(state, items);

  const feed = {
    schemaVersion: 2,
    status: 'ok',
    generatedAt: new Date().toISOString(),
    lookbackDays: args.days,
    stats: {
      rawItems: rssResults.reduce((sum, x) => sum + x.items.length, 0) + apiResults.reduce((sum, x) => sum + x.items.length, 0),
      keptItems: items.length,
      sourcesQueried: sources.length,
      sourcesWithResults: Object.values(healthcheck.per_source).filter(x => x.kept > 0).length,
      sourcesFailed: Object.values(healthcheck.per_source).filter(x => x.error).length,
      apiSourcesQueried: apiFetchers.length,
      apiSourcesWithResults: Object.values(healthcheck.per_api_source).filter(x => x.kept > 0).length,
      apiSourcesFailed: Object.values(healthcheck.per_api_source).filter(x => x.error).length,
      tavilySitesQueried: args.rssOnly || !tavilyKey ? 0 : tavilySites.length,
      tavilySitesWithResults: Object.values(healthcheck.tavily_per_site).filter(x => x.kept > 0).length,
      tavilySitesFailed: Object.values(healthcheck.tavily_per_site).filter(x => x.error).length
    },
    items,
    candidateItems: candidates.map(candidateReviewItem),
    candidateStats: buildCandidateStats(candidates, selected),
    groupedByCategory,
    keywordFilters: catalog.keyword_filters || {},
    scarcityTaxonomy: catalog.scarcity_taxonomy || null,
    healthcheck
  };

  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2));
  console.error(`feed-wearables.json: ${items.length} items (${feed.stats.sourcesFailed} RSS failures, ${feed.stats.tavilySitesWithResults} Tavily sites with results)`);
}

main().catch(err => {
  console.error(`Feed generation failed: ${err.message}`);
  process.exit(1);
});
