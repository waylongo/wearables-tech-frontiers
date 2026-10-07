import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoverage, finishRunState, mergeRemoteCoverage, scheduleTarget } from '../scripts/lib/coverage.mjs';
import { buildFromRemoteFeed, buildFromLocalRss } from '../scripts/prepare-digest.js';

const now = Date.parse('2026-10-07T12:00:00Z');
const catalog = { api_sources: { pubmed: [{ name: 'PubMed' }], arxiv: [{ name: 'arXiv' }] } };
const emptyFeed = () => ({ healthcheck: { warnings: [], per_api_source: { PubMed: { fetched: 0, datePassed: 0, kept: 0, error: null } } } });

test('two scheduled empty cycles warn; manual runs and reruns do not advance counters', () => {
  const first = emptyFeed();
  const counters = applyCoverage(first, catalog, { urls: {} }, { eventName: 'schedule', runId: '1', now });
  assert.equal(first.healthcheck.coverageStatus, 'healthy');
  for (const context of [{ eventName: 'workflow_dispatch', runId: '2' }, { eventName: 'schedule', runId: '1' }]) {
    const unchanged = applyCoverage(emptyFeed(), catalog, { sourceHealth: counters }, { ...context, now });
    assert.equal(unchanged['api:PubMed'].consecutiveEmpty, 1);
  }
  const second = emptyFeed();
  const next = applyCoverage(second, catalog, { sourceHealth: counters }, { eventName: 'schedule', runId: '2', now });
  assert.equal(next['api:PubMed'].consecutiveEmpty, 2);
  assert.match(second.healthcheck.warnings.join(), /2 consecutive/);
  assert.equal(second.healthcheck.coverageStatus, 'degraded');
});

test('date exhaustion warns immediately but relevance and selection filtering do not', () => {
  const feed = emptyFeed();
  Object.assign(feed.healthcheck.per_api_source.PubMed, { fetched: 25, datePassed: 0 });
  applyCoverage(feed, catalog, {}, { now });
  assert.match(feed.healthcheck.warnings.join(), /all 25/);
  const filtered = emptyFeed();
  Object.assign(filtered.healthcheck.per_api_source.PubMed, { fetched: 25, datePassed: 25, candidates: 0 });
  applyCoverage(filtered, catalog, {}, { now });
  assert.deepEqual(filtered.healthcheck.warnings, []);
  assert.equal(filtered.healthcheck.per_api_source.PubMed.status, 'filtered');
});

test('partial data and source errors are degraded, even if other sources succeed', () => {
  const feed = emptyFeed();
  Object.assign(feed.healthcheck.per_api_source.PubMed, { fetched: 100, datePassed: 100, kept: 3, error: 'search HTTP 503', partial: true });
  applyCoverage(feed, catalog, {}, { now });
  assert.equal(feed.healthcheck.coverageStatus, 'degraded');
  assert.equal(feed.healthcheck.per_api_source.PubMed.status, 'partial');
});

test('failure history preserves URL records, prunes 180 days and caps 200 runs', () => {
  const previous = { urls: { old: { lastSeen: now } }, runHistory: [{ completedAt: '2025-01-01T00:00:00Z' },
    ...Array.from({ length: 200 }, (_, i) => ({ runId: String(i), completedAt: new Date(now - 1000).toISOString() }))] };
  const report = { run: { runId: 'new' }, status: 'failed', publication: 'preserved', itemCount: 0,
    warnings: [], sources: [], findings: [{ kind: 'html_residue', title: 'Bad article', url: 'https://example.org/bad' }] };
  const state = finishRunState(previous, { urls: { changed: {} }, sourceHealth: { test: {} } }, report, false, now);
  assert.deepEqual(state.urls, previous.urls);
  assert.equal(state.runHistory.length, 200);
  assert.equal(state.runHistory.at(-1).findings[0].url, 'https://example.org/bad');
  assert.equal(state.runHistory.at(-1).outcome, 'failed');
});

test('remote warnings merge, old feeds remain compatible, stale boundary is eight days', () => {
  const health = { warnings: ['local warning'] };
  const feed = { generatedAt: new Date(now - 8 * 86400000).toISOString(), healthcheck: { warnings: ['source warning'] } };
  mergeRemoteCoverage(feed, health, now);
  assert.deepEqual(health.warnings, ['local warning', 'source warning']);
  const freshLegacy = { warnings: [] };
  mergeRemoteCoverage({ generatedAt: new Date(now).toISOString() }, freshLegacy, now);
  assert.equal(freshLegacy.coverageStatus, 'healthy');
  const stale = { warnings: [] };
  mergeRemoteCoverage({ ...feed, generatedAt: new Date(now - 8 * 86400000 - 1).toISOString() }, stale, now);
  assert.match(stale.warnings.join(), /stale/);
});

test('digest remote preparation uses the same fixed date window and forwards coverage', () => {
  const health = { warnings: [] };
  const data = buildFromRemoteFeed({ generatedAt: new Date(now).toISOString(), lookbackDays: 30,
    healthcheck: { coverageStatus: 'degraded', warnings: ['MobiHealthNews: HTTP 403'] },
    items: [{ sourceCategory: 'academic', publishedAt: new Date(now - 30 * 86400000).toISOString() },
      { sourceCategory: 'academic', publishedAt: new Date(now - 30 * 86400000 - 1).toISOString() }] }, ['academic'], 30, health, now);
  assert.equal(data.items.length, 1);
  assert.equal(health.coverageStatus, 'degraded');
  assert.match(health.warnings.join(), /403/);
});

test('local fallback supports migrated arXiv APIs without fetching PubMed or Tavily', async () => {
  const source = { name: 'arXiv', category: 'academic' };
  const health = { warnings: [], per_source: {}, per_api_source: {}, filtered_out_by_date: 0 };
  let calls = 0;
  const data = await buildFromLocalRss({ primary_rss: {}, api_sources: { arxiv: [source], pubmed: [{ name: 'PubMed' }] } },
    ['academic'], 30, health, { now, fetchArxivSource: async s => {
      calls++; return { source: s, error: null, items: [{ title: 'Wearable', url: 'https://arxiv.org/abs/2610.1', publishedAt: '2026-10-01' }] };
    } });
  assert.equal(calls, 1);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].retrievalMethod, 'api');
  assert.equal(data.stats.apiSourcesQueried, 1);
});

test('local arXiv fallback deduplicates cross-listed IDs and reports date exhaustion', async () => {
  const sources = ['eess.SP', 'cs.HC', 'old'].map(name => ({ name, category: 'academic' }));
  const health = { warnings: [], per_source: {}, per_api_source: {}, filtered_out_by_date: 0 };
  const data = await buildFromLocalRss({ primary_rss: {}, api_sources: { arxiv: sources } },
    ['academic'], 30, health, { now, fetchArxivSource: async source => ({ source, error: null,
      items: [{ arxivId: '2610.00001', title: 'Wearable', url: 'https://arxiv.org/abs/2610.00001',
        publishedAt: source.name === 'old' ? '2025-01-01' : '2026-10-01' }] }) });
  assert.equal(data.items.length, 1);
  assert.equal(health.per_api_source['cs.HC'].status, 'filtered');
  assert.match(health.warnings.join(), /old: all 1/);
});

test('schedule target uses Sunday 23:30 UTC even when job creation is delayed into Monday', () => {
  assert.equal(scheduleTarget('2026-10-05T02:13:49Z'), '2026-10-04T23:30:00.000Z');
  assert.equal(scheduleTarget('2026-10-04T23:49:00Z'), '2026-10-04T23:30:00.000Z');
});
