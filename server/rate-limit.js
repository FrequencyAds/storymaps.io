const RATE_LIMIT = 30;
const PROXY_RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

const rateLimitMap = new Map();
const proxyRateLimitMap = new Map();

// Pick the client IP. When trustProxy is true, honour the last entry
// of X-Forwarded-For (set by the closest trusted proxy, e.g. Caddy).
// Otherwise return the direct socket address — safe default when the
// app is not behind a reverse proxy or the proxy is untrusted.
export const pickClientIp = (req, { trustProxy } = {}) => {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',').pop().trim();
  }
  return req.socket.remoteAddress;
};

const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const getClientIp = (req) => pickClientIp(req, { trustProxy: TRUST_PROXY });

const checkLimit = (map, limit, req) => {
  const ip = getClientIp(req);
  const now = Date.now();
  let timestamps = map.get(ip);
  if (!timestamps) {
    timestamps = [];
    map.set(ip, timestamps);
  }
  while (timestamps.length && timestamps[0] <= now - RATE_WINDOW) timestamps.shift();
  if (timestamps.length >= limit) return true;
  timestamps.push(now);
  return false;
};

export const isRateLimited = (req) => checkLimit(rateLimitMap, RATE_LIMIT, req);
export const isProxyRateLimited = (req) => checkLimit(proxyRateLimitMap, PROXY_RATE_LIMIT, req);

// Clean up stale entries every 5 minutes. unref() so this timer does
// not keep the process alive on its own (matters under node --test and
// for short-lived invocations).
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const map of [rateLimitMap, proxyRateLimitMap]) {
    for (const [ip, timestamps] of map) {
      while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
      if (!timestamps.length) map.delete(ip);
    }
  }
}, 5 * 60_000).unref();
