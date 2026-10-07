#!/usr/bin/env node

import { readFile, writeFile, mkdir, rename, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { generateFeed, parseArgs } from './generate-feed.js';
import { checkFeedQuality } from './check-feed-quality.js';
import { finishRunState, scheduleTarget, sourceRows } from './lib/coverage.mjs';
import { request } from './lib/http.mjs';

const filename = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(filename), '..');

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, path);
}

async function runTiming(env, startedAt) {
  const run = { runId: env.GITHUB_RUN_ID || null, attempt: Number(env.GITHUB_RUN_ATTEMPT || 1),
    event: env.GITHUB_EVENT_NAME || 'local', startedAt, createdAt: startedAt, jobStartedAt: startedAt };
  if (env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY) {
    try {
      const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'wearables-tech-frontiers',
        ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) };
      const [metadata, jobs] = await Promise.all([request(base, { headers }), request(`${base}/jobs?filter=latest`, { headers })]);
      if (!metadata.ok || !jobs.ok) throw new Error('timing metadata unavailable');
      run.createdAt = JSON.parse(metadata.text).created_at;
      run.jobStartedAt = JSON.parse(jobs.text).jobs.find(job => job.name === 'generate')?.started_at || startedAt;
    } catch { run.timingWarning = 'GitHub timing metadata unavailable; using pipeline start time'; }
  }
  run.targetAt = run.event === 'schedule' ? scheduleTarget(run.createdAt) : null;
  run.triggerDelaySeconds = run.targetAt ? Math.max(0, (Date.parse(run.createdAt) - Date.parse(run.targetAt)) / 1000) : null;
  run.queueDelaySeconds = Math.max(0, (Date.parse(run.jobStartedAt) - Date.parse(run.createdAt)) / 1000);
  return run;
}

export async function runFeed({ outputDir, repoRoot = defaultRoot, publish = false, args = { days: 30, rssOnly: false },
  env = process.env, now = Date.now, generate = generateFeed, validate = checkFeedQuality,
  timing = runTiming } = {}) {
  outputDir ||= await mkdtemp(join(tmpdir(), 'wtf-feed-'));
  if (resolve(outputDir) === resolve(repoRoot)) throw new Error('output-dir must be a staging directory, not the repository root');
  await mkdir(outputDir, { recursive: true });
  const report = { status: 'failed', publication: 'preserved', publishedAt: null, coverageStatus: 'degraded',
    itemCount: 0, sources: [], warnings: [], findings: [],
    run: await timing(env, new Date(now()).toISOString()) };
  let previousState = { urls: {} };
  let candidate;
  let accepted = false;
  let phase = 'state';
  try {
    try { previousState = await readJson(join(repoRoot, 'state-feed.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    phase = 'generation';
    candidate = await generate(args, { previousState, env, now: now() });
    const { feed, state } = candidate;
    await writeJson(join(outputDir, 'feed-wearables.json'), feed);
    await writeJson(join(outputDir, 'candidate-state.json'), state);
    await writeJson(join(outputDir, 'generation-report.json'), {
      status: 'generated', generatedAt: feed.generatedAt, stats: feed.stats, healthcheck: feed.healthcheck
    });
    report.generatedAt = feed.generatedAt;
    report.lookbackDays = feed.lookbackDays;
    report.coverageStatus = feed.healthcheck?.coverageStatus || 'healthy';
    report.sources = sourceRows(feed.healthcheck);
    report.stats = feed.stats;
    phase = 'quality';
    const quality = validate(feed, { strict: true });
    await writeJson(join(outputDir, 'quality-report.json'), quality);
    Object.assign(report, { status: quality.status, itemCount: quality.itemCount,
      warnings: quality.warnings, findings: quality.findings });
    accepted = quality.status === 'passed';
    if (accepted) {
      report.run.acceptedAt = new Date(now()).toISOString();
      report.publication = publish ? 'prepared' : 'staged';
      phase = 'publication';
      if (publish) await writeJson(join(repoRoot, 'feed-wearables.json'), feed);
    }
  } catch (error) {
    report.status = 'failed';
    if (phase === 'publication') { accepted = false; report.publication = 'preserved'; }
    report.findings.push({ kind: `${phase}_failure`, detail: error.message });
  }
  report.run.completedAt = new Date(now()).toISOString();
  const state = finishRunState(previousState, candidate?.state, report, accepted, now());
  await writeJson(join(outputDir, 'state-feed.json'), state);
  // On rejection, only the diagnostic state is committed; URL history and the published feed stay intact.
  if (publish && phase !== 'state') await writeJson(join(repoRoot, 'state-feed.json'), state);
  await writeJson(join(outputDir, 'diagnostics.json'), report);
  return { report, state, outputDir };
}

function cell(value) { return String(value ?? '').replace(/[\r\n]+/g, ' ').replaceAll('|', '\\|'); }
function annotation(value) { return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'); }
export function summaryMarkdown(report) {
  const run = report.run || {};
  const lines = ['## Wearables Feed Summary', '',
    `- Result: ${report.status}; publication: ${report.publication}; coverage: ${report.coverageStatus}`,
    `- Target time (07:30 Beijing): ${run.targetAt || 'manual/local run'}`,
    `- Run created: ${run.createdAt || 'unknown'}; job started: ${run.jobStartedAt || 'unknown'}`,
    `- Trigger delay: ${run.triggerDelaySeconds ?? 'n/a'} seconds; queue delay: ${run.queueDelaySeconds ?? 'n/a'} seconds`,
    `- Generated at: ${report.generatedAt || 'unavailable'}; accepted at: ${run.acceptedAt || 'not accepted'}; published at: ${report.publishedAt || 'not published'}`,
    `- Lookback: ${report.lookbackDays ?? 'unknown'} days; raw items: ${report.stats?.rawItems ?? 0}; selected: ${report.itemCount || 0}`,
    '', '| Method | Source | Fetched | In window | Candidates | Selected | Status | Fallback |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |'];
  for (const row of report.sources || []) {
    lines.push(`| ${cell(row.method)} | ${cell(row.name)} | ${row.fetched || 0} | ${row.datePassed ?? 'n/a'} | ${row.candidates ?? row.qualityKept ?? 0} | ${row.kept || 0} | ${cell(row.status || row.error || 'unknown')} | ${cell(row.fallbackStatus || (row.fallback ? 'search' : ''))} |`);
  }
  const warnings = [...(report.warnings || []), ...(run.timingWarning ? [run.timingWarning] : [])];
  if (warnings.length) lines.push('', '### Warnings', ...warnings.map(w => `- ${cell(w)}`));
  if (report.findings?.length) lines.push('', '### Failures', ...report.findings.map(f => `- ${cell(f.kind)}: ${cell(f.title || f.detail)}${f.url ? ` (${cell(f.url)})` : ''}`));
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs();
  const outputDir = args.outputDir;
  if (process.argv.includes('--summary')) {
    let report;
    try { report = await readJson(join(outputDir, 'diagnostics.json')); }
    catch { report = { status: 'failed', publication: 'preserved', coverageStatus: 'degraded',
      warnings: [], findings: [{ kind: 'pipeline_failure', detail: 'Pipeline did not produce diagnostics' }] }; }
    const pushOutcome = process.argv.find(arg => arg.startsWith('--push-outcome='))?.slice(15);
    if (pushOutcome === 'success' && report.publication === 'prepared') {
      report.publication = 'published'; report.publishedAt = new Date().toISOString();
    } else if (pushOutcome === 'failure') {
      report.status = 'failed'; report.publication = 'push_failed';
      report.findings ||= []; report.findings.push({ kind: 'publication_failure', detail: 'Git commit or push failed' });
    }
    await writeJson(join(outputDir, 'diagnostics.json'), report);
    console.log(summaryMarkdown(report));
    if (process.env.GITHUB_STEP_SUMMARY) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report), { flag: 'a' });
      for (const warning of report.warnings || []) console.log(`::warning::${annotation(warning)}`);
      for (const finding of report.findings || []) console.log(`::error::${annotation(`${finding.kind}: ${finding.title || finding.detail}`)}`);
    }
    return;
  }
  const result = await runFeed({ outputDir, args, publish: process.argv.includes('--publish') });
  console.log(JSON.stringify({ status: result.report.status, publication: result.report.publication,
    coverageStatus: result.report.coverageStatus, items: result.report.itemCount, outputDir: result.outputDir }));
  if (result.report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === filename) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
