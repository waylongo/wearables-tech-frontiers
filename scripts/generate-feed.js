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
  return (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function extractField(block, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdata = block.match(cdataRe);
  if (cdata) return decodeEntities(cdata[1].trim());
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (m) return decodeEntities(stripTags(m[1]));
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
      publishedAt: pubDate || null,
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

function withinDays(dateStr, days) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const now = Date.now();
  if (d.getTime() > now + 24 * 60 * 60 * 1000) return false;
  return d.getTime() >= now - days * 24 * 60 * 60 * 1000;
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
  const hay = (scope === 'title' ? item.title : `${item.title} ${item.summary}`).toLowerCase();
  return keywords.some(k => hay.includes(k.toLowerCase()));
}

function passesBlacklist(title, patterns) {
  if (!patterns?.length) return true;
  const t = (title || '').toLowerCase().replace(/[’‘]/g, "'");
  return !patterns.some(p => t.includes(p.toLowerCase()));
}

function passesSourceExcludeFilter(item, patterns) {
  if (!patterns?.length) return true;
  const hay = `${item.title || ''} ${item.summary || ''}`.toLowerCase().replace(/[’‘]/g, "'");
  return !patterns.some(p => hay.includes(p.toLowerCase()));
}

function inferSignalType(item) {
  if (item.sourceCategory === 'regulatory') return 'clinical_regulatory';
  const hay = `${item.title || ''} ${item.summary || ''} ${item.sourceName || ''}`.toLowerCase();
  if (item.sourceCategory === 'clinical_registry') return 'clinical_regulatory';
  if (/(fda|510\(k\)|de novo|ce mark|mdr|clearance|approval|clinical trial|clinical validation|registry|endpoint)/i.test(hay)) {
    return 'clinical_regulatory';
  }
  if (/(api|sdk|developer|healthkit|workoutkit|health connect|health services|schema|permission|release notes|watchos|wear os)/i.test(hay)) {
    return 'platform_api';
  }
  if (/(funding|series [abc]|acquir|merger|partnership|ehr|insurance|subscription|reimbursement|business model)/i.test(hay)) {
    return 'business_structure';
  }
  if (item.sourceCategory === 'academic' || item.sourceCategory === 'vendor_research') return 'algorithm_evidence';
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
      const summaryParts = [
        status && `Status: ${status}`,
        conditions && `Conditions: ${conditions}`,
        interventions && `Interventions: ${interventions}`,
        phases && `Phase: ${phases}`
      ].filter(Boolean);
      return {
        title,
        url: `https://clinicaltrials.gov/study/${id}`,
        publishedAt: updated,
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
        publishedAt: row.pubdate || null,
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
        max_results: 5,
        include_answer: false,
        include_raw_content: false
      })
    });
    if (!res.ok) return { site, items: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const items = (data.results || []).slice(0, 5).map(r => ({
      title: (r.title || '').slice(0, 500),
      url: r.url,
      publishedAt: r.published_date || null,
      summary: (r.content || r.snippet || '').slice(0, 2000),
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

function pushUnique(items, item, seen) {
  if (!item.url || seen.has(item.url)) return false;
  seen.add(item.url);
  items.push(item);
  return true;
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
    filtered_out_by_date: 0,
    duplicate_urls: 0,
    top3_categories: null,
    top3_scores: null,
    top3_rejected_candidates: null
  };

  const sources = Object.values(catalog.primary_rss || {}).flat();
  const rssResults = await Promise.all(sources.map(fetchFeed));
  const items = [];
  const seen = new Set();

  for (const { source, items: sourceItems, error } of rssResults) {
    healthcheck.per_source[source.name] = { fetched: sourceItems.length, kept: 0, error };
    if (error) continue;
    for (const it of sourceItems) {
      if (!withinDays(it.publishedAt, args.days)) {
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
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_keyword++;
        continue;
      }
      const pushed = pushUnique(items, {
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'rss',
        signalType: inferSignalType({ ...it, sourceName: source.name, sourceCategory: source.category })
      }, seen);
      if (pushed) healthcheck.per_source[source.name].kept++;
      else healthcheck.duplicate_urls++;
    }
  }

  const apiFetchers = [
    ...(catalog.api_sources?.pubmed || []).map(source => ({ source, fetcher: fetchPubMed })),
    ...(catalog.api_sources?.clinical_trials || []).map(source => ({ source, fetcher: fetchClinicalTrials })),
    ...(catalog.api_sources?.openfda || []).map(source => ({ source, fetcher: s => fetchOpenFda(s, args.days) }))
  ];
  const apiResults = await Promise.all(apiFetchers.map(({ source, fetcher }) => fetcher(source)));
  for (const { source, items: sourceItems, error } of apiResults) {
    healthcheck.per_api_source[source.name] = { fetched: sourceItems.length, kept: 0, error };
    if (error) continue;
    for (const it of sourceItems) {
      if (!withinDays(it.publishedAt, args.days)) {
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
      if (!passesSourceExcludeFilter(it, source.excludeKeywordFilter)) {
        healthcheck.filtered_out_by_keyword++;
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
      const pushed = pushUnique(items, item, seen);
      if (pushed) healthcheck.per_api_source[source.name].kept++;
      else healthcheck.duplicate_urls++;
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
      healthcheck.tavily_per_site[site.name] = { fetched: siteItems.length, kept: 0, error };
      if (error) continue;
      for (const it of siteItems) {
        if (!passesBlacklist(it.title, blacklistPatterns)) {
          healthcheck.filtered_out_by_blacklist++;
          continue;
        }
        const pushed = pushUnique(items, {
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
          signalType: site.signalType || inferSignalType({
            title: it.title,
            summary: it.summary,
            sourceName: site.name,
            sourceCategory: site.sourceCategory || 'vendor_websearch'
          })
        }, seen);
        if (pushed) healthcheck.tavily_per_site[site.name].kept++;
        else healthcheck.duplicate_urls++;
      }
    }
  }

  items.sort((a, b) => (new Date(b.publishedAt || 0).getTime()) - (new Date(a.publishedAt || 0).getTime()));
  const groupedByCategory = {};
  for (const item of items) (groupedByCategory[item.sourceCategory] ||= []).push(item);

  const state = await loadState();
  await saveState(state, items);

  const feed = {
    schemaVersion: 1,
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
