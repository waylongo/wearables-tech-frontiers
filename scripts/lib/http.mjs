import { setTimeout as sleep } from 'node:timers/promises';

export function createHttpClient({ fetchImpl = (...args) => fetch(...args), wait = sleep,
  now = Date.now, rateLimits = { 'export.arxiv.org': 3000, 'eutils.ncbi.nlm.nih.gov': 350 } } = {}) {
  const queues = new Map();
  const lastRequests = new Map();
  async function inSlot(url, action) {
    const host = new URL(url).hostname;
    const interval = rateLimits[host] || 0;
    if (!interval) return action();
    const slot = (queues.get(host) || Promise.resolve()).then(async () => {
      const delay = (lastRequests.get(host) ?? -Infinity) + interval - now();
      if (delay > 0) await wait(delay);
      lastRequests.set(host, now());
      return action();
    });
    queues.set(host, slot.then(() => {}, () => {}));
    return slot;
  }
  return async function request(url, { timeoutMs = 15000, maxAttempts = 3, ...options } = {}) {
    let result;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let retryAfter = 0;
      await inSlot(url, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, { ...options, signal: controller.signal });
          const header = response.headers?.get('retry-after');
          if (header) {
            const seconds = Number(header);
            retryAfter = Math.min(30000, Math.max(0,
              Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now()));
          }
          result = { ok: response.ok, status: response.status,
            text: response.ok ? await response.text() : null, attempts: attempt + 1 };
        } catch (error) {
          result = { ok: false, status: 0, text: null, error: error.message, attempts: attempt + 1 };
        } finally {
          clearTimeout(timer);
        }
      });
      const transient = result.status === 0 || result.status === 429 || result.status >= 500;
      if (result.ok || !transient || attempt + 1 === maxAttempts) return result;
      await wait(Math.min(30000, Math.max(1000 * 2 ** attempt, retryAfter || 0)));
    }
    return result;
  };
}

export const request = createHttpClient();
export function httpGet(url, timeoutMs = 15000) {
  return request(url, { timeoutMs, headers: {
    'User-Agent': 'Mozilla/5.0 (wearables-tech-frontiers-feed/2.0)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*'
  } });
}
