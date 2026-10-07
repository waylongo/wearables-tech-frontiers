import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../scripts/lib/http.mjs';
import { fetchPubMed, fetchArxiv, parseArxiv, pubMedDate } from '../scripts/lib/academic.mjs';

const now = Date.parse('2026-10-07T12:00:00Z');
const source = { name: 'PubMed', query: 'wearable AND validation' };
const ok = value => ({ ok: true, status: 200, text: JSON.stringify(value) });

test('GET retries transient failures and caps Retry-After', async () => {
  let calls = 0;
  const delays = [];
  const request = createHttpClient({ rateLimits: {}, wait: async delay => delays.push(delay), fetchImpl: async () => {
    calls++;
    if (calls === 1) return new Response('', { status: 429, headers: { 'Retry-After': '120' } });
    if (calls === 2) return new Response('', { status: 503 });
    return new Response('success');
  } });
  assert.equal((await request('https://example.org')).text, 'success');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [30000, 2000]);
});

for (const status of [403, 418]) test(`HTTP ${status} is not retried`, async () => {
  let calls = 0;
  const request = createHttpClient({ fetchImpl: async () => { calls++; return new Response('', { status }); } });
  assert.equal((await request('https://example.org')).status, status);
  assert.equal(calls, 1);
});

test('timeouts abort, retry, and stop after three attempts', async () => {
  let calls = 0;
  const delays = [];
  const request = createHttpClient({ wait: async delay => delays.push(delay), fetchImpl: (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
  } });
  const result = await request('https://example.org', { timeoutMs: 1 });
  assert.equal(result.status, 0);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('POST search attempts are bounded at two', async () => {
  let calls = 0;
  const request = createHttpClient({ wait: async () => {}, fetchImpl: async () => { calls++; throw new Error('network'); } });
  await request('https://example.org', { method: 'POST', maxAttempts: 2 });
  assert.equal(calls, 2);
});

test('arXiv calls share a three second rate limit, including concurrent sources', async () => {
  let clock = 0;
  const starts = [];
  const request = createHttpClient({ now: () => clock, wait: async ms => { clock += ms; },
    fetchImpl: async () => { starts.push(clock); return new Response('ok'); } });
  await Promise.all([1, 2, 3].map(page => request(`https://export.arxiv.org/api/query?start=${page}`)));
  assert.deepEqual(starts, [0, 3000, 6000]);
});

test('PubMed electronic date wins over future print issue, with valid print fallback', () => {
  assert.deepEqual(pubMedDate({ epubdate: '2026 Sep 30', pubdate: '2027 Feb 1' }, now),
    { publishedAt: '2026-09-30T00:00:00.000Z', publishedAtSource: 'electronic' });
  assert.equal(pubMedDate({ epubdate: 'invalid', pubdate: '2026 Oct' }, now).publishedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(pubMedDate({ epubdate: '2027 Jan', pubdate: '2027 Feb' }, now).publishedAt, null);
  assert.equal(pubMedDate({ pubdate: '2026 Fall' }, now).publishedAt, '2026-10-01T00:00:00.000Z');
});

test('PubMed uses absolute window dates and preserves original dates', async () => {
  let calls = 0;
  const result = await fetchPubMed(source, 30, { now, get: async url => {
    const u = new URL(url); calls++;
    if (u.pathname.endsWith('esearch.fcgi')) {
      assert.equal(u.searchParams.get('mindate'), '2026/09/07');
      assert.equal(u.searchParams.get('maxdate'), '2026/10/07');
      assert.equal(u.searchParams.get('datetype'), 'pdat');
      assert.equal(u.searchParams.get('retmax'), '100');
      return ok({ esearchresult: { count: '1', idlist: ['123'] } });
    }
    return ok({ result: { '123': { title: 'Wearable validation', epubdate: '2026 Oct 1', pubdate: '2027 Feb', authors: [] } } });
  } });
  assert.equal(calls, 2);
  assert.equal(result.items[0].publishedAt, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(result.items[0].publicationDates, { electronic: '2026 Oct 1', print: '2027 Feb' });
});

test('PubMed paginates to 1000 and reports truncation', async () => {
  let pages = 0;
  const result = await fetchPubMed(source, 30, { now, get: async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('esearch.fcgi')) {
      pages++;
      const start = Number(u.searchParams.get('retstart'));
      return ok({ esearchresult: { count: '1100', idlist: Array.from({ length: 100 }, (_, i) => String(start + i)) } });
    }
    return ok({ result: Object.fromEntries(u.searchParams.get('id').split(',').map(id => [id, { title: `Wearable ${id}`, pubdate: '2026 Oct 1' }])) });
  } });
  assert.equal(pages, 10);
  assert.equal(result.items.length, 1000);
  assert.equal(result.partial, true);
  assert.match(result.warnings.join(' '), /truncated/);
});

test('PubMed retains completed pages when later requests fail', async () => {
  const result = await fetchPubMed(source, 7, { now, get: async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('esearch.fcgi')) return u.searchParams.get('retstart') === '0'
      ? ok({ esearchresult: { count: '200', idlist: Array.from({ length: 100 }, (_, i) => String(i)) } })
      : { ok: false, status: 503 };
    return ok({ result: Object.fromEntries(u.searchParams.get('id').split(',').map(id => [id, { title: `Wearable ${id}`, pubdate: '2026 Oct 1' }])) });
  } });
  assert.equal(result.items.length, 100);
  assert.equal(result.partial, true);
  assert.match(result.error, /503/);
});

const atom = (total, ids) => `<feed xmlns="http://www.w3.org/2005/Atom"><opensearch:totalResults>${total}</opensearch:totalResults>${ids.map(id =>
  `<entry><id>http://arxiv.org/abs/${id}v2</id><title>Wearable &amp; ECG</title><published>2026-10-01T12:00:00Z</published><updated>2026-10-05T12:00:00Z</updated><summary>Validation</summary></entry>`).join('')}</feed>`;

test('arXiv queries category, keywords, date range and maps first submission and canonical ID', async () => {
  const result = await fetchArxiv({ name: 'arXiv', arxivCategory: 'eess.SP' }, 30, { now, keywords: ['wearable', 'smart ring'], get: async url => {
    const u = new URL(url);
    assert.match(u.searchParams.get('search_query'), /cat:eess\.SP AND submittedDate:\[202609071200 TO 202610071200\]/);
    assert.match(u.searchParams.get('search_query'), /ti:"smart ring" OR abs:"smart ring"/);
    assert.equal(u.searchParams.get('max_results'), '100');
    return { ok: true, text: atom(1, ['2610.00001']) };
  } });
  assert.equal(result.items[0].arxivId, '2610.00001');
  assert.equal(result.items[0].publishedAt, '2026-10-01T12:00:00.000Z');
  assert.equal(result.items[0].title, 'Wearable & ECG');
  assert.equal(result.items[0].url, 'https://arxiv.org/abs/2610.00001');
});

test('arXiv pagination cap and partial errors are visible', async () => {
  const get = async url => {
    const start = Number(new URL(url).searchParams.get('start'));
    return { ok: true, text: atom(1001, Array.from({ length: 100 }, (_, i) => `2610.${start + i}`)) };
  };
  const capped = await fetchArxiv({ name: 'arXiv', arxivCategory: 'eess.SP' }, 30, { now, get });
  assert.equal(capped.items.length, 1000);
  assert.match(capped.warnings.join(), /truncated/);
  const partial = await fetchArxiv({ name: 'arXiv', arxivCategory: 'eess.SP' }, 30, { now, get: async url =>
    new URL(url).searchParams.get('start') === '0' ? get(url) : { ok: false, status: 503 } });
  assert.equal(partial.items.length, 100);
  assert.match(partial.error, /503/);
  assert.throws(() => parseArxiv('<html>blocked</html>'), /invalid/);
});

test('missing counts and unexpected empty pages report incomplete coverage', async () => {
  assert.throws(() => parseArxiv('<feed></feed>'), /result count/);
  const arxiv = await fetchArxiv({ name: 'arXiv', arxivCategory: 'eess.SP' }, 30,
    { now, get: async () => ({ ok: true, text: atom(5, []) }) });
  assert.match(arxiv.error, /empty arXiv page/);
  assert.equal(arxiv.partial, true);
  const pubmed = await fetchPubMed(source, 30,
    { now, get: async () => ok({ esearchresult: { count: '5', idlist: [], errorlist: {} } }) });
  assert.match(pubmed.error, /empty ESearch page/);
  assert.equal(pubmed.partial, true);
  const empty = await fetchPubMed(source, 30,
    { now, get: async () => ok({ esearchresult: { count: '0', idlist: [], errorlist: {} } }) });
  assert.equal(empty.error, null);
  assert.equal(empty.partial, false);
});
