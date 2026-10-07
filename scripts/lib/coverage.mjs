const DAY_MS = 86400000;

export function sourceRows(health = {}) {
  return [['rss', health.per_source], ['api', health.per_api_source], ['tavily', health.tavily_per_site]]
    .flatMap(([method, sources]) => Object.entries(sources || {}).map(([name, data]) => ({ method, name, ...data })));
}

export function applyCoverage(feed, catalog, previousState = {}, { eventName = 'local', runId,
  now = Date.now() } = {}) {
  const health = feed.healthcheck;
  const counters = structuredClone(previousState.sourceHealth || {});
  const critical = new Set([...(catalog.api_sources?.pubmed || []), ...(catalog.api_sources?.arxiv || [])].map(s => s.name));
  const scheduled = eventName === 'schedule';
  const cycle = String(runId || new Date(now).toISOString());
  const warnings = new Set(health.warnings || []);
  for (const row of sourceRows(health)) {
    const key = `${row.method}:${row.name}`;
    const counter = { consecutiveErrors: 0, consecutiveEmpty: 0, ...counters[key] };
    if (scheduled && counter.lastScheduledRunId !== cycle) {
      counter.consecutiveErrors = row.error ? counter.consecutiveErrors + 1 : 0;
      counter.consecutiveEmpty = !row.error && row.fetched === 0 ? counter.consecutiveEmpty + 1 : 0;
      counter.lastScheduledRunId = cycle;
      counters[key] = counter;
    }
    if (row.error) warnings.add(`${row.name}: ${row.error}${row.fetched ? ' (partial results retained)' : ''}`);
    if (row.partial) warnings.add(`${row.name}: coverage incomplete`);
    for (const warning of row.warnings || []) warnings.add(`${row.name}: ${warning}`);
    if (row.fetched > 0 && row.datePassed === 0 && (row.method !== 'tavily' || row.fallback)) {
      warnings.add(`${row.name}: all ${row.fetched} fetched items were rejected by the date window`);
    }
    if (critical.has(row.name) && counter.consecutiveEmpty >= 2 && row.fetched === 0 && !row.error) {
      warnings.add(`${row.name}: empty for ${counter.consecutiveEmpty} consecutive scheduled runs`);
    }
    const sources = row.method === 'rss' ? health.per_source : row.method === 'api' ? health.per_api_source : health.tavily_per_site;
    sources[row.name].status = row.error ? (row.fetched ? 'partial' : 'failed') : row.partial ? 'partial'
      : row.fetched === 0 ? 'empty' : row.datePassed === 0 && (row.method !== 'tavily' || row.fallback)
        ? 'date_exhausted' : (row.kept || 0) === 0 ? 'filtered' : 'ok';
  }
  health.warnings = [...warnings];
  health.coverageStatus = warnings.size ? 'degraded' : 'healthy';
  return counters;
}

export function candidateState(previousState, items, sourceHealth, now = Date.now()) {
  const state = structuredClone(previousState);
  state.urls ||= {};
  state.sourceHealth = sourceHealth;
  for (const item of items) {
    state.urls[item.url] = { firstSeen: state.urls[item.url]?.firstSeen || now, lastSeen: now,
      sourceName: item.sourceName, sourceCategory: item.sourceCategory };
  }
  for (const [url, meta] of Object.entries(state.urls)) {
    if ((meta.lastSeen || 0) < now - 60 * DAY_MS) delete state.urls[url];
  }
  return state;
}

export function finishRunState(previousState, candidate, report, accepted, now = Date.now()) {
  const state = structuredClone(accepted && candidate ? candidate : previousState);
  state.urls ||= {};
  state.sourceHealth = candidate?.sourceHealth || previousState.sourceHealth || {};
  const record = { ...report.run, completedAt: new Date(now).toISOString(), outcome: report.status,
    publication: report.publication, coverageStatus: report.coverageStatus, itemCount: report.itemCount,
    warnings: report.warnings || [], sources: report.sources || [],
    findings: (report.findings || []).slice(0, 100).map(({ kind, sourceName, title, url, detail }) =>
      ({ kind, sourceName, title: title?.slice(0, 500), url: url?.slice(0, 2000), detail: detail?.slice(0, 1000) })) };
  const history = (previousState.runHistory || []).filter(entry => {
    const date = Date.parse(entry.completedAt || entry.startedAt);
    return Number.isFinite(date) && date >= now - 180 * DAY_MS;
  });
  state.runHistory = [...history, record].slice(-200);
  return state;
}

export function mergeRemoteCoverage(feed, health, now = Date.now()) {
  health.warnings = [...new Set([...(health.warnings || []), ...(feed.healthcheck?.warnings || [])])];
  const generated = Date.parse(feed.generatedAt);
  if (!Number.isFinite(generated) || now - generated > 8 * DAY_MS) {
    health.warnings.push(`Central feed is stale: generatedAt=${feed.generatedAt || 'unknown'} (weekly freshness limit: 8 days)`);
  }
  health.coverageStatus = feed.healthcheck?.coverageStatus === 'degraded' || health.warnings.length ? 'degraded' : 'healthy';
}

export function scheduleTarget(createdAt) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  date.setUTCHours(23, 30, 0, 0);
  if (date.getTime() > Date.parse(createdAt)) date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString();
}
