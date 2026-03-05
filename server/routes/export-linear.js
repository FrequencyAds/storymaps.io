import { sendSSE, fetchWithTimeout, safeJson } from '../http-helpers.js';

export default function register(ctx) {
  const { route } = ctx;
  route('POST', '/api/export/linear/verify', async (req, res, params, body) => {
    if (ctx.isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { apiKey } = body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Missing or invalid API key' }));
      return;
    }
    try {
      const r = await fetchWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: '{ viewer { id name email } }' })
      }, 10_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403 || data.errors?.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: data.errors?.[0]?.message || 'Authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: data.data?.viewer?.name || data.data?.viewer?.email || 'Unknown' }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Connection failed: ${e.message}` }));
    }
  });

  route('POST', '/api/export/linear', async (req, res, params, body) => {
    if (ctx.isProxyRateLimited(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    const { apiKey, teamKey, items } = body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length > 256) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid API key' }));
      return;
    }
    if (!teamKey || typeof teamKey !== 'string' || teamKey.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(teamKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid team key' }));
      return;
    }
    if (!Array.isArray(items)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: items' }));
      return;
    }
    const totalSubIssues = items.reduce((n, it) => n + (it.subissues?.length || 0), 0);
    if (items.length > 200 || totalSubIssues > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many items. Max 200 parent issues and 2000 sub-issues.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const linearGql = async (query, variables) => {
      const r = await fetchWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      }, 30_000);
      const data = await safeJson(r);
      if (r.status === 401 || r.status === 403) throw new Error('Authentication failed');
      if (data.errors?.length) throw new Error(data.errors[0].message);
      return data.data;
    };
    // Resolve teamId from teamKey
    let teamId;
    try {
      const teamsData = await linearGql('{ teams { nodes { id name key } } }');
      const team = teamsData.teams.nodes.find(t => t.key.toLowerCase() === teamKey.toLowerCase());
      if (!team) {
        sendSSE(res, 'done', { created: 0, failed: 0, error: `Team "${teamKey}" not found` });
        res.end();
        return;
      }
      teamId = team.id;
    } catch (e) {
      sendSSE(res, 'done', { created: 0, failed: 0, error: (e.message || 'Unknown error').slice(0, 200) });
      res.end();
      return;
    }
    const CREATE_ISSUE = `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`;
    let created = 0, failed = 0;
    for (const item of items) {
      sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'creating' });
      let parentId;
      try {
        const input = { teamId, title: item.name };
        if (item.description) input.description = item.description;
        const result = await linearGql(CREATE_ISSUE, { input });
        if (!result.issueCreate.success) throw new Error('Issue creation failed');
        parentId = result.issueCreate.issue.id;
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'created', key: result.issueCreate.issue.identifier, url: result.issueCreate.issue.url });
        created++;
      } catch (e) {
        sendSSE(res, 'progress', { type: 'task', name: item.name, status: 'error', error: (e.message || 'Unknown error').slice(0, 200) });
        failed++;
        failed += (item.subissues?.length || 0);
        continue;
      }
      for (const sub of (item.subissues || [])) {
        sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'creating' });
        try {
          const input = { teamId, title: sub.name, parentId };
          if (sub.description) input.description = sub.description;
          if (typeof sub.estimate === 'number' && sub.estimate >= 0) input.estimate = sub.estimate;
          const result = await linearGql(CREATE_ISSUE, { input });
          if (!result.issueCreate.success) throw new Error('Sub-issue creation failed');
          sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'created', key: result.issueCreate.issue.identifier, url: result.issueCreate.issue.url });
          created++;
        } catch (e) {
          sendSSE(res, 'progress', { type: 'subtask', name: sub.name, status: 'error', error: (e.message || 'Unknown error').slice(0, 200) });
          failed++;
        }
      }
    }
    sendSSE(res, 'done', { created, failed });
    res.end();
  });
}
