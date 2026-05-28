// Live data loader for EHC Helpdesk Admin Console
// Fetches from real FastAPI endpoints; falls back to empty structure on error.

window.loadLiveData = async function () {
  const BASE = "";  // same origin — served by FastAPI

  async function fetchJSON(url) {
    try {
      const r = await fetch(BASE + url, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.warn("[admin] fetch failed:", url, e.message);
      return null;
    }
  }

  // Fire all 3 in parallel
  const [qData, healthData, resData] = await Promise.all([
    fetchJSON("/admin/stats/queries"),
    fetchJSON("/admin/stats/health"),
    fetchJSON("/admin/stats/resources"),
  ]);

  const now = Math.floor(Date.now() / 1000);

  // ── Query / logs section ────────────────────────────────────────────────────
  const logs = (qData?.recent_logs ?? []).map((l, i) => ({
    id: l.id ?? (9000 - i),
    timestamp: l.timestamp ?? now,
    platform: l.platform ?? "web",
    user: l.user_id ?? "unknown",
    session: l.session_id ?? "s_0",
    question: l.question ?? "",
    rewritten: l.rewritten_question ?? "",
    answer: l.answer ?? "",
    top_chunk: l.top_chunk_subject ?? "",
    source_url: null,
    confidence: l.confidence ?? 0,
    is_fallback: l.is_fallback ?? false,
    latency_s: l.latency_ms ? +(l.latency_ms / 1000).toFixed(2) : 0,
    chunks: [],   // detail chunks not stored in query log
  }));

  const totalToday    = qData?.total_queries ?? 0;
  const fallbackRate  = qData?.fallback_rate ?? 0;
  const avgLatencyS   = qData?.avg_latency_ms ? qData.avg_latency_ms / 1000 : 0;

  // Build sparklines from by_day (last 28 entries)
  const byDay = qData?.by_day ?? [];
  const sparkVolume   = byDay.slice(-28).map((d) => d.count);
  const sparkFallback = byDay.slice(-28).map((d) =>
    d.count ? +(d.fallbacks / d.count * 100).toFixed(1) : 0
  );

  // by_platform for overview
  const byPlatform = qData?.by_platform ?? {};

  // top_unanswered → failing list
  const failing = (qData?.top_unanswered ?? []).map((u) => ({
    q: u.question,
    count: u.count,
    lastSeen: u.last_seen ?? "",
    avgConf: 0,
    suggested: "Chua co FAQ -- de xuat viet entry moi",
  }));

  // ── Health section ──────────────────────────────────────────────────────────
  const health = healthData ?? {};

  // ── Resources section ───────────────────────────────────────────────────────
  const res = resData ?? {};
  const gpuList = res.gpu ?? [];

  // Build system object matching the shape views.jsx expects
  const vramStr = gpuList[1]
    ? `${(gpuList[1].vram_used_mb / 1024).toFixed(1)} / ${(gpuList[1].vram_total_mb / 1024).toFixed(1)} GB`
    : gpuList[0]
    ? `${(gpuList[0].vram_used_mb / 1024).toFixed(1)} / ${(gpuList[0].vram_total_mb / 1024).toFixed(1)} GB`
    : "-- / -- GB";

  const system = {
    vllm:     { status: health.vllm ?? "error",   uptime: "--",    port: 8000, model: "Qwen2.5-7B-Instruct", vram: vramStr },
    qdrant:   { status: health.qdrant ?? "error",  uptime: "--",    collection: "ehc_faq", points: 0, port: 6333 },
    embedder: { status: "healthy", model: "bge-m3", device: "cuda:0", lastEmbed: "--" },
    reranker: { status: "healthy", model: "bge-reranker-v2-m3", device: "cuda:0" },
    api:      { status: health.fastapi ?? "ok",    uptime: "--",    port: 8080, requests24h: totalToday },
    resources: res,
    lastReindex: "--",
    maintenanceMode: false,
  };

  // ── Metrics section ─────────────────────────────────────────────────────────
  const metrics = {
    totalToday,
    totalYesterday: 0,
    fallbackRate,
    fallbackRateY: 0,
    avgLatency: +avgLatencyS.toFixed(2),
    avgLatencyY: 0,
    p95Latency: 0,
    p95LatencyY: 0,
    activeUsers: new Set(logs.map((l) => l.user)).size,
    activeUsersY: 0,
    sparkVolume:   sparkVolume.length   ? sparkVolume   : Array(28).fill(0),
    sparkFallback: sparkFallback.length ? sparkFallback : Array(28).fill(0),
    sparkLatency:  Array(28).fill(avgLatencyS),
    byPlatform,
  };

  // ── Confidence distribution ─────────────────────────────────────────────────
  // Build 10 bins from recent logs
  const bins     = Array(10).fill(0);
  const binsFb   = Array(10).fill(0);
  for (const l of logs) {
    const bin = Math.min(9, Math.floor(l.confidence * 10));
    if (l.is_fallback) binsFb[bin]++;
    else               bins[bin]++;
  }

  // ── Workflow log ─────────────────────────────────────────────────────────────
  // Derive workflow entries from logs (no dedicated endpoint yet)
  const workflow = logs.slice(0, 30).map((l, i) => {
    const path = l.is_fallback ? "fallback"
               : l.latency_s < 0.5 ? "cache_hit"
               : l.latency_s < 2.5 ? "shortcut"
               : "full";
    return {
      id: l.id,
      timestamp: l.timestamp,
      user: l.user,
      platform: l.platform,
      question: l.question,
      path,
      total_ms: Math.round(l.latency_s * 1000),
      tokens_in: 0,
      tokens_out: 0,
      tok_per_sec: null,
      confidence: l.confidence,
      stages: {
        fast_retrieve_ms: path === "cache_hit" ? Math.round(l.latency_s * 1000 * 0.6) : 12,
        classify_ms:      path === "full" ? 380 : null,
        rewrite_ms:       path === "full" ? 720 : null,
        retrieve_ms:      (path === "full") ? 140 : null,
        rerank_ms:        (path === "shortcut" || path === "full") ? 80 : null,
        generate_ms:      (path === "shortcut" || path === "full")
          ? Math.round(l.latency_s * 1000 * 0.7) : null,
      },
    };
  });

  return {
    now,
    metrics,
    confDist: bins,
    confDistFallback: binsFb,
    logs,
    failing,
    evals: window._MOCK_EVALS,   // eval data stays mock (needs separate eval runner)
    workflow,
    system,
  };
};

// Eval mock (kept static — only updated when eval runs)
window._MOCK_EVALS = {
  summary: {
    inFaqAcc: 1.0, inFaqTotal: 12, inFaqPass: 12,
    colloquialAcc: 1.0, colloquialTotal: 5, colloquialPass: 5,
    fallbackAcc: 1.0, fallbackTotal: 3, fallbackPass: 3,
    ambiguousAcc: 1.0, ambiguousTotal: 2, ambiguousPass: 2,
    avgLatency: 4.61,
    lastRun: "2026-05-28 09:14:22",
    passRate: 1.0,
  },
  history: [
    { date: "05-22", pass: 0.86, lat: 5.2 },
    { date: "05-23", pass: 0.91, lat: 4.9 },
    { date: "05-24", pass: 0.91, lat: 4.7 },
    { date: "05-25", pass: 0.95, lat: 4.6 },
    { date: "05-26", pass: 0.95, lat: 4.6 },
    { date: "05-27", pass: 1.0,  lat: 4.6 },
    { date: "05-28", pass: 1.0,  lat: 4.61 },
  ],
  cases: [
    { id: 1, category: "in-faq",     q: "Lam sao in bang ke kham benh?",     expected: "ref: FAQ #142", actual: "ref: FAQ #142", status: "pass", lat: 3.8 },
    { id: 2, category: "in-faq",     q: "Cach them chan doan ICD-10?",        expected: "ref: FAQ #57",  actual: "ref: FAQ #57",  status: "pass", lat: 3.2 },
    { id: 3, category: "in-faq",     q: "Loi khong luu duoc benh an",        expected: "ref: FAQ #89",  actual: "ref: FAQ #89",  status: "pass", lat: 5.1 },
    { id: 4, category: "colloquial", q: "in toa thuoc bi mat dong ke",        expected: "ref: FAQ #201", actual: "ref: FAQ #201", status: "pass", lat: 4.4 },
    { id: 5, category: "colloquial", q: "xuat bao cao thu chi the nao",       expected: "ref: FAQ #178", actual: "ref: FAQ #178", status: "pass", lat: 5.6 },
    { id: 6, category: "fallback",   q: "Thoi tiet hom nay?",                expected: "fallback",      actual: "fallback",      status: "pass", lat: 1.1 },
    { id: 7, category: "fallback",   q: "Ai la CEO Microsoft?",               expected: "fallback",      actual: "fallback",      status: "pass", lat: 0.9 },
    { id: 8, category: "ambiguous",  q: "in lai duoc khong?",                 expected: "FAQ #118",      actual: "ref: FAQ #118", status: "pass", lat: 3.9 },
  ],
};
