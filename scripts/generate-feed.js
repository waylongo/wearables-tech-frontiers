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
  return d.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function passesKeywordFilter(item, keywords) {
  if (!keywords?.length) return true;
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  return keywords.some(k => hay.includes(k.toLowerCase()));
}

function passesBlacklist(title, patterns) {
  if (!patterns?.length) return true;
  const t = (title || '').toLowerCase();
  return !patterns.some(p => t.includes(p.toLowerCase()));
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

function tavilyDomain(site) {
  const siteMatch = site.query?.match(/site:([^\s)]+)/);
  if (siteMatch) return siteMatch[1].replace(/^www\./, '');
  try {
    return new URL(site.homeUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function tavilyQuery(site) {
  return (site.query || '')
    .replace(/site:[^\s)]+/g, '')
    .replace(/\s+OR\s+site:[^\s)]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tavilyTimeRange(days) {
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'year';
}

async function fetchTavilySite(site, apiKey, days) {
  const domain = tavilyDomain(site);
  const query = tavilyQuery(site);
  if (!domain || !query) return { site, items: [], error: 'missing domain or query' };

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
        include_domains: [domain],
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
      if (source.keywordFilter && !passesKeywordFilter(it, source.keywordFilter)) {
        healthcheck.filtered_out_by_keyword++;
        continue;
      }
      const pushed = pushUnique(items, {
        ...it,
        sourceName: source.name,
        sourceCategory: source.category,
        sourcePriority: source.priority,
        sourceLang: source.lang || 'en',
        retrievalMethod: 'rss'
      }, seen);
      if (pushed) healthcheck.per_source[source.name].kept++;
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
          sourceCategory: 'vendor_websearch',
          sourcePriority: 'P1',
          sourceLang: 'en',
          retrievalMethod: 'tavily',
          score: it.score || null
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
      rawItems: rssResults.reduce((sum, x) => sum + x.items.length, 0),
      keptItems: items.length,
      sourcesQueried: sources.length,
      sourcesWithResults: Object.values(healthcheck.per_source).filter(x => x.kept > 0).length,
      sourcesFailed: Object.values(healthcheck.per_source).filter(x => x.error).length,
      tavilySitesQueried: args.rssOnly || !tavilyKey ? 0 : tavilySites.length,
      tavilySitesWithResults: Object.values(healthcheck.tavily_per_site).filter(x => x.kept > 0).length,
      tavilySitesFailed: Object.values(healthcheck.tavily_per_site).filter(x => x.error).length
    },
    items,
    groupedByCategory,
    monitorOnlyHints: {
      vendor_official: (catalog.monitor_only?.vendor_official || []).slice(0, 8),
      industry_media: (catalog.monitor_only?.industry_media || []).slice(0, 5),
      chinese_media_p2: (catalog.monitor_only?.chinese_media_p2 || []).slice(0, 4)
    },
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
