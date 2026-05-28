// Frontend ↔ Backend bridge for EHC Admin Console.
//
// - Detects whether a real backend is reachable.
// - Wraps every admin endpoint as a Promise.
// - Falls back to MOCK_DATA when offline / unreachable.
// - Exposes a useApi() hook for declarative data loading.
//
// Configuration:
//   - Default base = window.location.origin (works when the API serves this UI).
//   - Override with ?api=http://host:8080 in the URL, or localStorage.ehcApiBase.
//   - Force mock with ?mock=1 (or localStorage.ehcUseMock = "1").

(function () {
  const qs = new URLSearchParams(location.search);

  const FORCED_BASE =
    qs.get("api") ||
    localStorage.getItem("ehcApiBase") ||
    "";

  const DEFAULT_BASE =
    location.protocol === "file:" ? "" : location.origin;

  const API_BASE = (FORCED_BASE || DEFAULT_BASE).replace(/\/+$/, "");

  const FORCE_MOCK =
    qs.get("mock") === "1" || localStorage.getItem("ehcUseMock") === "1";

  // Persist a manual override
  if (qs.get("api")) localStorage.setItem("ehcApiBase", qs.get("api"));

  // ----------------------------------------------------------------------
  // HTTP helper
  // ----------------------------------------------------------------------
  async function jget(path, opts = {}) {
    if (!API_BASE) throw new Error("no_api_base");
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), opts.timeout || 8000);
    try {
      const r = await fetch(API_BASE + path, {
        signal: ctl.signal,
        headers: { "Accept": "application/json" },
        method: opts.method || "GET",
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        ...(opts.body ? { headers: { "Accept": "application/json", "Content-Type": "application/json" } } : {}),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // ----------------------------------------------------------------------
  // Connection probe — sets api.online once on boot
  // ----------------------------------------------------------------------
  let _online = null;
  let _probePromise = null;

  function probe() {
    if (FORCE_MOCK || !API_BASE) {
      _online = false;
      return Promise.resolve(false);
    }
    if (_probePromise) return _probePromise;
    _probePromise = jget("/health", { timeout: 2500 })
      .then((r) => { _online = !!r && r.status === "ok"; return _online; })
      .catch(() => { _online = false; return false; });
    return _probePromise;
  }

  // ----------------------------------------------------------------------
  // Endpoint wrappers — each returns { source: "live" | "mock", data }
  // ----------------------------------------------------------------------
  async function call(liveFn, mockFn) {
    const ok = await probe();
    if (ok) {
      try { return { source: "live", data: await liveFn() }; }
      catch (e) { console.warn("[ehc-api] live call failed, falling back to mock:", e); }
    }
    return { source: "mock", data: mockFn() };
  }

  const api = {
    base: API_BASE,
    forceMock: FORCE_MOCK,
    isOnline: () => _online,
    probe,

    metrics: (days = 1) => call(
      () => jget(`/admin/metrics?days=${days}`),
      () => MockShape.metrics(),
    ),
    logs: (opts = {}) => {
      const p = new URLSearchParams();
      p.set("limit", String(opts.limit || 100));
      if (opts.fallback_only) p.set("fallback_only", "true");
      if (opts.platform && opts.platform !== "all") p.set("platform", opts.platform);
      if (opts.search) p.set("search", opts.search);
      return call(
        () => jget(`/admin/logs?${p.toString()}`),
        () => MockShape.logs(opts),
      );
    },
    logDetail: (id) => call(
      () => jget(`/admin/logs/${id}`),
      () => MockShape.logDetail(id),
    ),
    failing: (limit = 20, days = 7) => call(
      () => jget(`/admin/failing?limit=${limit}&days=${days}`),
      () => MockShape.failing(),
    ),
    evalResults: () => call(
      () => jget(`/admin/eval/results`),
      () => MockShape.evalResults(),
    ),
    systemStatus: () => call(
      () => jget(`/admin/system/status`),
      () => MockShape.systemStatus(),
    ),
    reindex: () => jget(`/admin/reindex`, { method: "POST" }),
    runEval: () => jget(`/admin/eval/run`, { method: "POST" }),
    setMaintenance: (enabled, token) =>
      fetch(API_BASE + `/admin/maintenance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ enabled }),
      }).then((r) => r.json()),
  };

  // ----------------------------------------------------------------------
  // Mock adapters — shape the existing MOCK_DATA to match the live API.
  // ----------------------------------------------------------------------
  const MockShape = {
    metrics() {
      const m = window.MOCK_DATA.metrics;
      return {
        as_of: Math.floor(Date.now() / 1000),
        window_days: 1,
        totals: { today: m.totalToday, yesterday: m.totalYesterday },
        fallback_rate: { today: m.fallbackRate, yesterday: m.fallbackRateY },
        avg_latency: {
          today: m.avgLatency, yesterday: m.avgLatencyY,
          p95_today: m.p95Latency, p95_yesterday: m.p95LatencyY,
        },
        active_users: { today: m.activeUsers, yesterday: m.activeUsersY },
        sparkline_volume: m.sparkVolume,
        sparkline_latency: m.sparkLatency,
        sparkline_fallback_pct: m.sparkFallback,
        confidence_distribution: {
          answered: window.MOCK_DATA.confDist,
          fallback: window.MOCK_DATA.confDistFallback,
        },
        confidence_threshold: 0.4,
      };
    },
    logs(opts) {
      let logs = window.MOCK_DATA.logs.slice();
      if (opts.fallback_only) logs = logs.filter((l) => l.is_fallback);
      if (opts.platform && opts.platform !== "all") logs = logs.filter((l) => l.platform === opts.platform);
      if (opts.search) {
        const s = opts.search.toLowerCase();
        logs = logs.filter((l) =>
          l.question.toLowerCase().includes(s) ||
          l.user.toLowerCase().includes(s)
        );
      }
      // Match real API field names
      const remapped = logs.slice(0, opts.limit || 100).map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        user_id: l.user,
        session_id: l.session,
        platform: l.platform,
        question: l.question,
        rewritten_question: l.rewritten,
        answer: l.answer,
        confidence: l.confidence,
        is_fallback: l.is_fallback,
        latency_s: l.latency_s,
        top_chunk_subject: l.top_chunk,
        source_url: l.source_url,
        chunks: l.chunks,
      }));
      return { count: remapped.length, logs: remapped };
    },
    logDetail(id) {
      const l = window.MOCK_DATA.logs.find((x) => x.id === id);
      if (!l) return null;
      return MockShape.logs({ limit: 1 }).logs[0];
    },
    failing() {
      return {
        days: 7,
        count: window.MOCK_DATA.failing.length,
        items: window.MOCK_DATA.failing.map((f) => ({
          question: f.q,
          count: f.count,
          avg_confidence: f.avgConf,
          any_fallback: false,
          last_seen_ts: 0,
          last_seen_human: f.lastSeen,
          suggested: f.suggested,
        })),
      };
    },
    evalResults() {
      const e = window.MOCK_DATA.evals;
      const s = e.summary;
      return {
        latest: {
          last_run: s.lastRun + " UTC",
          last_run_ts: Math.floor(Date.now() / 1000),
          total: s.inFaqTotal + s.colloquialTotal + s.fallbackTotal + s.ambiguousTotal,
          total_passed: s.inFaqPass + s.colloquialPass + s.fallbackPass + s.ambiguousPass,
          pass_rate: 1.0,
          avg_latency: s.avgLatency,
          by_category: {
            in_faq:     { total: s.inFaqTotal,      passed: s.inFaqPass },
            colloquial: { total: s.colloquialTotal, passed: s.colloquialPass },
            not_in_faq: { total: s.fallbackTotal,   passed: s.fallbackPass },
            ambiguous:  { total: s.ambiguousTotal,  passed: s.ambiguousPass },
          },
          cases: e.cases.map((c) => ({
            id: c.id,
            question: c.q,
            type: c.category === "in-faq" ? "in_faq"
                : c.category === "fallback" ? "not_in_faq"
                : c.category,
            confidence: 0.85,
            is_fallback: c.category === "fallback",
            elapsed: c.lat,
            passed: c.status === "pass",
            fail_reason: "",
            actual_top_subject: c.actual,
            expected_faq_subject: c.expected,
          })),
        },
        history: e.history.map((h) => ({
          date: h.date,
          pass_rate: h.pass,
          avg_latency: h.lat,
          total: 22,
          passed: Math.round(22 * h.pass),
        })),
      };
    },
    systemStatus() {
      const s = window.MOCK_DATA.system;
      return {
        as_of: Math.floor(Date.now() / 1000),
        fastapi: { status: "healthy", uptime: s.api.uptime, uptime_seconds: 0 },
        qdrant: {
          status: "healthy", url: "http://localhost:6333",
          collection: s.qdrant.collection, points_count: s.qdrant.points,
        },
        vllm: { status: "healthy", url: "http://localhost:8000", model: s.vllm.model },
        embedder: { model: s.embedder.model, device: s.embedder.device, status: "loaded" },
        reranker: { model: s.reranker.model, device: s.reranker.device, status: "loaded" },
        redmine: { url: "https://redmine.local", project: "ehcfaq", last_reindex: s.lastReindex, status: "unknown" },
        maintenance_mode: s.maintenanceMode,
        cache_sizes: {},
      };
    },
  };

  // ----------------------------------------------------------------------
  // React hook — declarative data loading w/ refresh
  // ----------------------------------------------------------------------
  function useApi(fn, deps = []) {
    const [state, setState] = React.useState({
      data: null, loading: true, error: null, source: null,
    });
    const fnRef = React.useRef(fn);
    fnRef.current = fn;

    const load = React.useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { source, data } = await fnRef.current();
        setState({ data, loading: false, error: null, source });
      } catch (e) {
        setState({ data: null, loading: false, error: String(e), source: null });
      }
    }, []);

    React.useEffect(() => { load(); }, deps);  // eslint-disable-line

    return { ...state, refresh: load };
  }

  window.ehcApi = api;
  window.useApi = useApi;
})();
