export const createRouter = () => {
  const routes = [];

  const route = (method, pattern, handler) => {
    if (pattern.includes(':')) {
      // Convert :param to named capture groups
      const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, '(?<$1>[a-zA-Z0-9_-]+)') + '$');
      routes.push({ method, re, handler });
    } else {
      // Static path - exact match
      routes.push({ method, pattern, handler });
    }
  };

  const matchRoute = (method, path) => {
    for (const r of routes) {
      if (r.method !== method) continue;
      if (r.pattern) {
        if (r.pattern === path) return { handler: r.handler, params: {} };
      } else {
        const m = path.match(r.re);
        if (m) return { handler: r.handler, params: m.groups || {} };
      }
    }
    return null;
  };

  return { route, matchRoute };
};
