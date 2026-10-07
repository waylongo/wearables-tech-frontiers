import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateFeed, canonicalUrlForDedupe, cleanTextField } from '../scripts/generate-feed.js';
import { checkFeedQuality } from '../scripts/check-feed-quality.js';
import { runFeed, summaryMarkdown } from '../scripts/run-feed.js';

const now = Date.parse('2026-10-07T12:00:00Z');
const item = (id = 'Alpha') => ({ title: `${id} wearable ECG clinical validation algorithm`,
  url: `https://example.org/article/${id}`, publishedAt: '2026-10-01T00:00:00Z',
  summary: 'Prospective wearable ECG validation in a clinical cohort n=120.' });
const goodSource = { name: 'Good journal', category: 'academic', priority: 'P1' };
const blockedSource = { name: 'MobiHealthNews', category: 'industry_news', priority: 'P1',
  keywordFilter: ['wearable'], fallbackWebsearch: { domains: ['example.org'], query: 'wearable health' } };
function catalog(sources = [goodSource, blockedSource]) {
  return { primary_rss: { academic: sources }, api_sources: {}, keyword_filters: { wearables_en: ['wearable', 'ecg'] },
    websearch_sites: { sites: [] } };
}
const rss = async source => source.name === blockedSource.name
  ? { source, items: [], error: 'HTTP 403' } : { source, items: [item()], error: null };

test('fallback runs only for failed RSS, preserves category, drops undated/out-of-window items and caps selection', async () => {
  const calls = [];
  const result = await generateFeed({ days: 30 }, { catalog: catalog(), previousState: { urls: {} }, now,
    env: { TAVILY_API_KEY: 'test-only' }, fetchRss: rss, fetchSearch: async site => {
      calls.push(site);
      return { site, error: null, items: [item('Bravo'), item('Charlie'), item('Delta'), item('Echo'),
        { ...item('Undated'), publishedAt: null }, { ...item('Stale'), publishedAt: '2025-01-01' }] };
    } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].domains, ['example.org']);
  const fallbackItems = result.feed.items.filter(i => i.sourceName === blockedSource.name);
  assert.equal(fallbackItems.length, 3);
  assert.ok(fallbackItems.every(i => i.sourceCategory === 'industry_news' && i.retrievalMethod === 'tavily'));
  assert.ok(!result.feed.items.some(i => /Undated|Stale/.test(i.title)));
  assert.equal(result.feed.healthcheck.coverageStatus, 'degraded');
  assert.equal(checkFeedQuality(result.feed, { strict: true }).status, 'passed');
});

test('successful RSS does not trigger fallback; rss-only and missing key do not invoke search', async () => {
  for (const scenario of [
    { args: { days: 30 }, env: { TAVILY_API_KEY: 'test' }, fetchRss: async source => ({ source, items: [item(source.name)], error: null }) },
    { args: { days: 30, rssOnly: true }, env: { TAVILY_API_KEY: 'test' }, fetchRss: rss },
    { args: { days: 30 }, env: {}, fetchRss: rss }
  ]) {
    await generateFeed(scenario.args, { ...scenario, catalog: catalog(), previousState: { urls: {} }, now,
      fetchSearch: async () => { assert.fail('Unexpected search'); } });
  }
});

test('fallback failure remains a warning and allows the healthy feed to pass', async () => {
  const result = await generateFeed({ days: 30 }, { catalog: catalog(), previousState: { urls: {} }, now,
    env: { TAVILY_API_KEY: 'test' }, fetchRss: rss,
    fetchSearch: async site => ({ site, items: [], error: 'HTTP 503' }) });
  assert.equal(result.feed.stats.tavilySitesFailed, 1);
  assert.equal(checkFeedQuality(result.feed).status, 'passed');
  assert.match(result.feed.healthcheck.warnings.join(), /RSS fallback failed/);
});

test('arXiv papers are deduplicated across categories and URL versions', async () => {
  const c = catalog([]);
  c.api_sources.arxiv = [{ name: 'arXiv eess.SP', category: 'academic' }, { name: 'arXiv cs.HC', category: 'academic' }];
  const result = await generateFeed({ days: 30 }, { catalog: c, previousState: { urls: {} }, now, env: {},
    fetchArxivSource: async source => ({ source, items: [{ ...item(), arxivId: '2610.00001', url: 'http://arxiv.org/abs/2610.00001v2' }], error: null }) });
  assert.equal(result.feed.items.length, 1);
  assert.equal(result.feed.healthcheck.duplicate_urls, 1);
  assert.equal(result.feed.items[0].url, 'https://arxiv.org/abs/2610.00001');
  assert.equal(canonicalUrlForDedupe('https://export.arxiv.org/pdf/2610.00001v3.pdf'), 'https://arxiv.org/abs/2610.00001');
});

test('fixed date boundaries are applied before relevance and selection', async () => {
  const result = await generateFeed({ days: 30 }, { catalog: catalog([goodSource]), previousState: { urls: {} }, now, env: {},
    fetchRss: async source => ({ source, error: null, items: [
      { ...item('Boundary'), publishedAt: new Date(now - 30 * 86400000).toISOString() },
      { ...item('Outside'), publishedAt: new Date(now - 30 * 86400000 - 1).toISOString() },
      { ...item('Future'), publishedAt: new Date(now + 86400000 + 1).toISOString() }] }) });
  assert.equal(result.feed.healthcheck.per_source[goodSource.name].datePassed, 1);
  assert.equal(result.feed.items.length, 1);
  assert.match(result.feed.items[0].title, /Boundary/);
});

test('existing Markdown/entity cleanup handles nested URLs and headings without residue', () => {
  for (const input of ['[Wear OS notes](https://example.org/path_(beta)) and **updates**',
    '![sensor](https://example.org/sensor.png) ## Wearable &amp; ECG', '[reference][ref]\n[ref]: https://example.org']) {
    const cleaned = cleanTextField(input, 500);
    assert.doesNotMatch(cleaned, /\[[^\]]+\]\([^)]+\)|&amp;|##|\*\*/);
  }
});

function validFeed(items = [{ ...item(), sourceName: goodSource.name, sourceCategory: 'academic', retrievalMethod: 'rss' }]) {
  return { schemaVersion: 2, generatedAt: new Date(now).toISOString(), lookbackDays: 30, items,
    candidateItems: items.map(i => ({ ...i, selectionStatus: 'selected' })), candidateStats: { selectedItems: items.length },
    stats: { keptItems: items.length }, healthcheck: { coverageStatus: 'healthy', warnings: [], per_source: {} } };
}

for (const [kind, feed] of [
  ['empty_feed', validFeed([])],
  ['html_residue', validFeed([{ ...item(), summary: '<p>Clinical results</p>' }])],
  ['markdown_link_residue', validFeed([{ ...item(), summary: '[results](https://example.org)' }])],
  ['duplicate_url', validFeed([item(), item('Different')].map(i => ({ ...i, url: 'https://example.org/same' })))]
]) test(`quality gate blocks ${kind}`, () => {
  const result = checkFeedQuality(feed, { strict: true });
  assert.equal(result.status, 'failed');
  assert.ok(result.findings.some(f => f.kind === kind));
});

test('legacy feed without selection metadata passes existing checks', () => {
  assert.equal(checkFeedQuality({ schemaVersion: 1, items: [item()] }).status, 'passed');
});

async function sandbox(t) {
  const dir = await mkdtemp(join(tmpdir(), 'wtf-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repoRoot = join(dir, 'repo'); const outputDir = join(dir, 'stage');
  await mkdir(repoRoot);
  const state = { urls: { 'https://example.org/old': { firstSeen: now - 1000, lastSeen: now } } };
  await writeFile(join(repoRoot, 'feed-wearables.json'), 'OLD FEED');
  await writeFile(join(repoRoot, 'state-feed.json'), JSON.stringify(state));
  return { repoRoot, outputDir, state };
}
const timing = async (_, startedAt) => ({ startedAt, event: 'local' });

test('publication accepts a degraded valid feed and records diagnostics', async t => {
  const paths = await sandbox(t);
  const feed = validFeed(); feed.healthcheck.coverageStatus = 'degraded'; feed.healthcheck.warnings = ['MobiHealthNews: HTTP 403'];
  const result = await runFeed({ ...paths, publish: true, now: () => now, timing,
    generate: async () => ({ feed, state: { urls: { 'https://example.org/new': {} }, sourceHealth: {} } }) });
  assert.equal(result.report.status, 'passed');
  assert.equal(JSON.parse(await readFile(join(paths.repoRoot, 'feed-wearables.json'), 'utf8')).items.length, 1);
  assert.equal(result.state.runHistory.at(-1).outcome, 'passed');
  assert.match(summaryMarkdown(result.report), /MobiHealthNews: HTTP 403/);
  assert.match(summaryMarkdown(result.report), /published at: not published/);
});

for (const failure of ['generation', 'quality']) test(`${failure} failure preserves feed and URLs but persists failure diagnostics`, async t => {
  const paths = await sandbox(t);
  const result = await runFeed({ ...paths, publish: true, now: () => now, timing, generate: async () => {
    if (failure === 'generation') throw new Error('simulated generation failure');
    return { feed: validFeed([]), state: { urls: { changed: {} }, sourceHealth: { changed: {} } } };
  } });
  assert.equal(result.report.status, 'failed');
  assert.equal(await readFile(join(paths.repoRoot, 'feed-wearables.json'), 'utf8'), 'OLD FEED');
  const state = JSON.parse(await readFile(join(paths.repoRoot, 'state-feed.json'), 'utf8'));
  assert.deepEqual(state.urls, paths.state.urls);
  assert.equal(state.runHistory.at(-1).outcome, 'failed');
  assert.ok(JSON.parse(await readFile(join(paths.outputDir, 'diagnostics.json'), 'utf8')).findings.length);
  assert.match(summaryMarkdown(result.report), /Failures/);
});

test('branch/staging runs do not modify repository feed or state', async t => {
  const paths = await sandbox(t);
  await runFeed({ ...paths, publish: false, now: () => now, timing,
    generate: async () => ({ feed: validFeed(), state: { urls: { new: {} } } }) });
  assert.equal(await readFile(join(paths.repoRoot, 'feed-wearables.json'), 'utf8'), 'OLD FEED');
  assert.deepEqual(JSON.parse(await readFile(join(paths.repoRoot, 'state-feed.json'), 'utf8')), paths.state);
  await assert.rejects(runFeed({ repoRoot: paths.repoRoot, outputDir: paths.repoRoot }), /staging directory/);
});

test('quality CLI writes a structured failure report even for unreadable input', async t => {
  const paths = await sandbox(t);
  const report = join(paths.outputDir, 'report.json');
  const result = spawnSync(process.execPath, ['scripts/check-feed-quality.js', `--feed=${join(paths.repoRoot, 'feed-wearables.json')}`, `--report=${report}`]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).findings[0].kind, 'unreadable_feed');
});
