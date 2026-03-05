export default function register(ctx) {
  const { route } = ctx;
  route('GET', '/api/stats', async (req, res) => {
    const stats = await ctx.readJson(ctx.STATS_FILE, { mapCount: 0 });
    let activeUsers = 0;
    for (const [, doc] of ctx.docs) {
      activeUsers += doc.awareness.getStates().size;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ ...stats, activeUsers }));
  });

  route('POST', '/api/stats', async (req, res) => {
    const stats = await ctx.readJson(ctx.STATS_FILE, { mapCount: 0 });
    stats.mapCount = (stats.mapCount || 0) + 1;
    await ctx.writeJson(ctx.STATS_FILE, stats);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(stats));
  });
}
