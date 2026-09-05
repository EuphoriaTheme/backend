const metrics = {
  startedAt: Date.now(),
  requestCount: 0,
  requestDurationTotalMs: 0,
  requestDurationMaxMs: 0,
  gameCacheHits: 0,
  gameCacheMisses: 0,
  gameQueriesCompleted: 0,
  gameQueryDurationTotalMs: 0,
  gameQueryDurationMaxMs: 0,
  activeGameQueries: 0,
};

export function recordRequestDuration(durationMs) {
  metrics.requestCount += 1;
  metrics.requestDurationTotalMs += durationMs;
  metrics.requestDurationMaxMs = Math.max(
    metrics.requestDurationMaxMs,
    durationMs,
  );
}

export function recordGameCacheHit() {
  metrics.gameCacheHits += 1;
}

export function recordGameCacheMiss() {
  metrics.gameCacheMisses += 1;
}

export function setActiveGameQueries(count) {
  metrics.activeGameQueries = count;
}

export function recordGameQueryDuration(durationMs) {
  metrics.gameQueriesCompleted += 1;
  metrics.gameQueryDurationTotalMs += durationMs;
  metrics.gameQueryDurationMaxMs = Math.max(
    metrics.gameQueryDurationMaxMs,
    durationMs,
  );
}

export function getRuntimeMetrics() {
  const totalCacheLookups = metrics.gameCacheHits + metrics.gameCacheMisses;
  const memory = process.memoryUsage();
  return {
    startedAt: new Date(metrics.startedAt).toISOString(),
    requests: {
      count: metrics.requestCount,
      averageDurationMs:
        metrics.requestCount > 0
          ? Math.round(metrics.requestDurationTotalMs / metrics.requestCount)
          : 0,
      maxDurationMs: Math.round(metrics.requestDurationMaxMs),
    },
    gameQueries: {
      active: metrics.activeGameQueries,
      completed: metrics.gameQueriesCompleted,
      averageDurationMs:
        metrics.gameQueriesCompleted > 0
          ? Math.round(
              metrics.gameQueryDurationTotalMs / metrics.gameQueriesCompleted,
            )
          : 0,
      maxDurationMs: Math.round(metrics.gameQueryDurationMaxMs),
      cacheHits: metrics.gameCacheHits,
      cacheMisses: metrics.gameCacheMisses,
      cacheHitRate:
        totalCacheLookups > 0
          ? Number((metrics.gameCacheHits / totalCacheLookups).toFixed(4))
          : 0,
    },
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
    },
  };
}
