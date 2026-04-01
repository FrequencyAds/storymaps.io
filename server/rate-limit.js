const RATE_LIMIT = 30;
const PROXY_RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

const rateLimitMap = new Map();
const proxyRateLimitMap = new Map();

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  // Use last entry - set by Caddy (the closest trusted proxy)
  if (forwarded) return forwarded.split(',').pop().trim();
  return req.socket.remoteAddress;
};

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

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const map of [rateLimitMap, proxyRateLimitMap]) {
    for (const [ip, timestamps] of map) {
      while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
      if (!timestamps.length) map.delete(ip);
    }
  }
}, 5 * 60_000);
