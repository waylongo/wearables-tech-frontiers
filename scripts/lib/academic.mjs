import { httpGet } from './http.mjs';

const DAY_MS = 86400000;
const PAGE_SIZE = 100;
const MAX_ITEMS = 1000;

export function publicationDate(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, ' ').trim()
    .replace(/\b(Winter|Spring|Summer|Fall|Autumn)\b/i, season =>
      ({ winter: 'Jan', spring: 'Apr', summer: 'Jul', fall: 'Oct', autumn: 'Oct' })[season.toLowerCase()]);
  const calendar = text.match(/^(\d{4})(?:\s+([a-z]{3,9})(?:-[a-z]{3,9})?(?:\s+(\d{1,2})(?:-\d{1,2})?)?)?$/i);
  let ms;
  if (calendar) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = calendar[2] ? months.indexOf(calendar[2].slice(0, 3).toLowerCase()) : 0;
    const day = Number(calendar[3] || 1);
    if (month < 0 || day < 1 || day > 31) return null;
    ms = Date.UTC(Number(calendar[1]), month, day);
    if (new Date(ms).getUTCMonth() !== month) return null;
  } else ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function pubMedDate(row, now) {
  for (const [field, kind] of [['epubdate', 'electronic'], ['pubdate', 'print']]) {
    const date = publicationDate(row[field]);
    if (date && Date.parse(date) <= now + DAY_MS) return { publishedAt: date, publishedAtSource: kind };
  }
  return { publishedAt: null, publishedAtSource: null };
}

function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10).replaceAll('-', '/'); }
function failure(response, phase) {
  return `${phase} HTTP ${response.status}${response.error ? ': ' + response.error : ''}`;
}

export async function fetchPubMed(source, days = 30, { now = Date.now(), get = httpGet } = {}) {
  const items = [];
  const warnings = [];
  let error = null;
  let total = 0;
  try {
    for (let start = 0; start < MAX_ITEMS; start += PAGE_SIZE) {
      const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
      for (const [key, value] of Object.entries({ db: 'pubmed', term: source.query, retmode: 'json',
        sort: 'pub date', retmax: PAGE_SIZE, retstart: start, datetype: 'pdat',
        mindate: utcDate(now - days * DAY_MS), maxdate: utcDate(now) })) {
        searchUrl.searchParams.set(key, String(value));
      }
      const search = await get(searchUrl.toString(), 20000);
      if (!search.ok) { error = failure(search, 'search'); break; }
      const result = JSON.parse(search.text).esearchresult;
      if (!result || result.ERROR || Object.values(result.errorlist || {}).some(value => value?.length)) {
        throw new Error('invalid ESearch response');
      }
      const ids = result.idlist || [];
      total = Number(result.count);
      if (!Array.isArray(ids) || !Number.isInteger(total) || total < 0) throw new Error('invalid ESearch count or IDs');
      if (!ids.length) {
        if (start < total) throw new Error(`empty ESearch page at ${start} of ${total}`);
        break;
      }
      const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
      summaryUrl.search = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' }).toString();
      const summary = await get(summaryUrl.toString(), 20000);
      if (!summary.ok) { error = failure(summary, 'summary'); break; }
      const data = JSON.parse(summary.text).result;
      if (!data) throw new Error('invalid ESummary response');
      for (const id of ids) {
        const row = data[id];
        if (!row?.title) { warnings.push(`PubMed metadata missing for PMID ${id}`); continue; }
        const authors = (row.authors || []).map(a => a.name).filter(Boolean).slice(0, 4).join(', ');
        items.push({ title: row.title, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          ...pubMedDate(row, now), publicationDates: { electronic: row.epubdate || null, print: row.pubdate || null },
          summary: [row.source && `Journal: ${row.source}`, authors && `Authors: ${authors}`,
            row.epubdate && `Electronic publication: ${row.epubdate}`, row.pubdate && `Print publication: ${row.pubdate}`]
            .filter(Boolean).join(' | '), pmid: id });
      }
      if (start + ids.length >= total) break;
    }
    if (total > MAX_ITEMS) warnings.push(`PubMed results truncated at ${MAX_ITEMS} of ${total}`);
  } catch (err) { error = `parse: ${err.message}`; }
  if (error) warnings.push(`PubMed pagination incomplete: ${error}`);
  return { source, items, error, warnings, partial: Boolean(error || warnings.length), total };
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<(?:(?:[\\w-]+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${tag}>`, 'i'));
  return (match?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, value) => String.fromCodePoint(value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name])
    .replace(/\s+/g, ' ').trim();
}

export function parseArxiv(xml) {
  if (!/<feed\b/.test(xml)) throw new Error('invalid arXiv Atom response');
  const entries = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/g) || [];
  const items = entries.map(entry => {
    const rawId = xmlText(entry, 'id');
    if (!rawId.includes('/abs/')) throw new Error(`arXiv API error: ${xmlText(entry, 'summary') || rawId}`);
    const arxivId = rawId.split('/abs/')[1].replace(/v\d+$/, '');
    return { arxivId, title: xmlText(entry, 'title'), url: `https://arxiv.org/abs/${arxivId}`,
      publishedAt: publicationDate(xmlText(entry, 'published')), summary: xmlText(entry, 'summary') };
  });
  const count = xmlText(xml, 'totalResults');
  const total = Number(count);
  if (!count || !Number.isInteger(total) || total < 0) throw new Error('invalid arXiv result count');
  return { items, total };
}

function arxivDate(ms) { return new Date(ms).toISOString().slice(0, 16).replace(/[-:T]/g, ''); }
export async function fetchArxiv(source, days = 30, { now = Date.now(), get = httpGet, keywords = [] } = {}) {
  const items = [];
  const warnings = [];
  let total = 0;
  let error = null;
  const terms = source.keywordFilter || keywords;
  const keywordQuery = terms.map(term => {
    const quoted = `"${term.replace(/["\\]/g, '')}"`;
    return `(ti:${quoted} OR abs:${quoted})`;
  }).join(' OR ');
  const query = `cat:${source.arxivCategory} AND submittedDate:[${arxivDate(now - days * DAY_MS)} TO ${arxivDate(now)}]`
    + (keywordQuery ? ` AND (${keywordQuery})` : '');
  try {
    for (let start = 0; start < MAX_ITEMS; start += PAGE_SIZE) {
      const url = new URL('https://export.arxiv.org/api/query');
      url.search = new URLSearchParams({ search_query: query, start: String(start), max_results: String(PAGE_SIZE),
        sortBy: 'submittedDate', sortOrder: 'descending' }).toString();
      const response = await get(url.toString(), 20000);
      if (!response.ok) { error = failure(response, 'arXiv'); break; }
      const page = parseArxiv(response.text);
      total = page.total;
      items.push(...page.items);
      if (!page.items.length && start < total) throw new Error(`empty arXiv page at ${start} of ${total}`);
      if (start + page.items.length >= total) break;
    }
    if (total > MAX_ITEMS) warnings.push(`arXiv results truncated at ${MAX_ITEMS} of ${total}`);
  } catch (err) { error = `parse: ${err.message}`; }
  if (error) warnings.push(`arXiv pagination incomplete: ${error}`);
  return { source, items, error, warnings, partial: Boolean(error || warnings.length), total };
}
