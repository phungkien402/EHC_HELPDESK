// View pages — every page fetches via window.ehcApi (live → mock fallback).
// All components read the **live API shape** (snake_case). The mock adapter
// in api.js reshapes MOCK_DATA to match, so this is identical against either.

const { useState: _us, useMemo: _um, useEffect: _ue, useRef: _ur } = React;

// ---- shared small bits ----------------------------------------------------

function LoadingCard({ height = 160 }) {
  return (
    <div className="card" style={{ padding: 40, display: "grid", placeItems: "center", height, color: "var(--text-muted)", fontSize: 13 }}>
      <div className="row-flex" style={{ gap: 8 }}>
        <Icon name="refresh" size={14}/>
        Đang tải…
      </div>
    </div>
  );
}

function ErrorCard({ error, retry }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="row-flex" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="alert" size={16}/>
        <span className="strong">Không tải được dữ liệu</span>
      </div>
      <div className="muted mono" style={{ fontSize: 11.5, marginBottom: 10 }}>{error}</div>
      <button className="btn sm" onClick={retry}><Icon name="refresh" size={12}/>Thử lại</button>
    </div>
  );
}

// ============================================================
// Overview
// ============================================================
function OverviewPage({ t, lang, onOpenLogs, onOpenFailing }) {
  const metricsQ = useApi(() => window.ehcApi.metrics(1), []);
  const failingQ = useApi(() => window.ehcApi.failing(4, 7), []);

  if (metricsQ.loading) return <LoadingShell t={t} title={t.overview_title} sub={t.overview_sub}/>;
  if (metricsQ.error) return <ErrorCard error={metricsQ.error} retry={metricsQ.refresh}/>;

  const m = metricsQ.data;
  const dVol = m.totals.today - m.totals.yesterday;
  const dFb  = m.fallback_rate.today - m.fallback_rate.yesterday;
  const dLat = m.avg_latency.today - m.avg_latency.yesterday;
  const dUsr = m.active_users.today - m.active_users.yesterday;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.overview_title}</div>
          <div className="page-sub">{t.overview_sub}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={metricsQ.refresh}><Icon name="refresh" size={13}/>{t.refresh}</button>
          <button className="btn primary" onClick={() => window.ehcApi.runEval().catch(()=>{})}><Icon name="play" size={14}/>{t.run_eval}</button>
        </div>
      </div>

      <div className="kpi-row">
        <KpiCard label={t.kpi_volume}   value={fmtNum(m.totals.today)}        delta={dVol} deltaFmt={(v)=>(v>0?"+":"")+v}                  spark={m.sparkline_volume}        subTxt={t.vs_yesterday} goodIsUp/>
        <KpiCard label={t.kpi_fallback} value={fmtPct(m.fallback_rate.today)} delta={dFb}  deltaFmt={(v)=>(v>0?"+":"")+(v*100).toFixed(1)+"pt"} spark={m.sparkline_fallback_pct} subTxt={t.vs_yesterday} color="oklch(0.7 0.17 48)"/>
        <KpiCard label={t.kpi_latency}  value={m.avg_latency.today.toFixed(2)} unit="s" delta={dLat} deltaFmt={(v)=>(v>0?"+":"")+v.toFixed(2)+"s"} spark={m.sparkline_latency} subTxt={`p95 ${m.avg_latency.p95_today.toFixed(1)}s`}/>
        <KpiCard label={t.kpi_users}    value={fmtNum(m.active_users.today)}  delta={dUsr} deltaFmt={(v)=>(v>0?"+":"")+v}                  spark={[28,32,30,35,33,38,34,38]} subTxt={t.vs_yesterday} goodIsUp/>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.conf_dist_title}</div>
              <div className="card-sub">{t.conf_dist_sub} · threshold = <span className="mono">{m.confidence_threshold}</span></div>
            </div>
            <div className="card-actions">
              <span className="pill ok"><span className="dot"/>OK</span>
              <span className="pill bad"><span className="dot"/>Fallback</span>
            </div>
          </div>
          <div className="card-body">
            <ConfidenceDistribution
              dist={m.confidence_distribution.answered}
              fbDist={m.confidence_distribution.fallback}
              threshold={m.confidence_threshold}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.volume_title}</div>
              <div className="card-sub">{t.volume_sub}</div>
            </div>
          </div>
          <div className="card-body">
            <BarChart values={m.sparkline_volume} labels={["28d","21d","14d","7d","0d"]} color="var(--green-500)" height={160}/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t.top_failing_title}</div>
            <div className="card-sub">{t.top_failing_sub}</div>
          </div>
          <div className="card-actions">
            <button className="btn sm" onClick={onOpenFailing}>{t.view_all}<Icon name="external" size={12}/></button>
          </div>
        </div>
        <div className="card-body">
          {failingQ.loading && <div className="muted" style={{ padding: 20, textAlign: "center" }}>Đang tải…</div>}
          {failingQ.data && failingQ.data.items.slice(0, 4).map((f, i) => (
            <div key={i} className="fail-row">
              <div>
                <div className="q">"{f.question}"</div>
                <div className="meta">{f.suggested} · {t.col_last}: {f.last_seen_human}</div>
              </div>
              <div>
                <div className="count">{f.count}</div>
                <div className="count-lbl">hits</div>
              </div>
              <div>
                <ConfBar value={f.avg_confidence} fallback={false}/>
              </div>
            </div>
          ))}
          {failingQ.data && failingQ.data.items.length === 0 && (
            <div className="muted" style={{ padding: 20, textAlign: "center" }}>Không có câu hỏi fail trong 7 ngày qua. 🎉</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingShell({ t, title, sub }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{sub}</div>
        </div>
      </div>
      <div className="kpi-row">
        {[1,2,3,4].map((i) => <LoadingCard key={i} height={100}/>)}
      </div>
      <div className="grid-2">
        <LoadingCard/>
        <LoadingCard/>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, delta, deltaFmt, spark, subTxt, color, goodIsUp }) {
  const isUp = delta > 0;
  const isGood = goodIsUp ? isUp : !isUp;
  const cls = delta === 0 ? "flat" : isGood ? "up" : "down";
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tnum">{value}{unit && <span className="unit">{unit}</span>}</div>
      <div className="kpi-row-2">
        <div className="row-flex" style={{ gap: 6 }}>
          {delta !== 0 && (
            <span className={"delta " + cls}>
              <Icon name={isUp ? "arrow-up" : "arrow-down"} size={10}/>
              {deltaFmt(Math.abs(delta) * (isUp ? 1 : -1))}
            </span>
          )}
          <span className="muted" style={{ fontSize: 11 }}>{subTxt}</span>
        </div>
        {spark && <Sparkline values={spark} color={color || "var(--green-500)"} fill/>}
      </div>
    </div>
  );
}

function ConfidenceDistribution({ dist, fbDist, threshold = 0.4 }) {
  const total = dist.reduce((a, b) => a + b, 0) + fbDist.reduce((a, b) => a + b, 0);
  const max = Math.max(...dist.map((v, i) => v + fbDist[i]), 1);
  const labels = ["0.0-0.1","0.1-0.2","0.2-0.3","0.3-0.4","0.4-0.5","0.5-0.6","0.6-0.7","0.7-0.8","0.8-0.9","0.9-1.0"];
  return (
    <div>
      {dist.map((v, i) => {
        const fb = fbDist[i];
        const widthOk = (v / max) * 100;
        const widthFb = (fb / max) * 100;
        return (
          <div key={i} className="bar-row">
            <div className="lbl">{labels[i]}</div>
            <div className="bar-track">
              {widthFb > 0 && <div className="bar-fill fb" style={{ width: widthFb + "%" }}/>}
              {widthOk > 0 && <div className="bar-fill" style={{ left: widthFb + "%", width: widthOk + "%" }}/>}
            </div>
            <div className="val">{v + fb}</div>
          </div>
        );
      })}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, fontFamily: "var(--font-mono)" }}>
        n = {total} · threshold = {threshold}
      </div>
    </div>
  );
}

// ============================================================
// Logs page
// ============================================================
function LogsPage({ t, lang, debug }) {
  const [filter, setFilter] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // Debounce search a touch
  const [debSearch, setDebSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const logsQ = useApi(
    () => window.ehcApi.logs({
      limit: 200,
      fallback_only: filter === "fallback",
      platform,
      search: debSearch,
    }),
    [filter, platform, debSearch]
  );

  const data = logsQ.data || { logs: [], count: 0 };
  const logs = data.logs.filter((l) => filter === "ok" ? !l.is_fallback : true);
  const okCount = data.logs.filter((l) => !l.is_fallback).length;
  const fbCount = data.logs.filter((l) => l.is_fallback).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.logs_title}</div>
          <div className="page-sub">
            {t.logs_sub} · <span className="mono tnum">{data.count}</span> {lang === "vi" ? "bản ghi" : "records"}
            {logsQ.source === "live" && <span className="pill ok" style={{ marginLeft: 8 }}><span className="dot"/>live</span>}
            {logsQ.source === "mock" && <span className="pill muted" style={{ marginLeft: 8 }}><span className="dot"/>mock</span>}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={logsQ.refresh}><Icon name="refresh" size={13}/>{t.refresh}</button>
          <button className="btn"><Icon name="download" size={13}/>{t.export}</button>
        </div>
      </div>

      <div className="filters">
        <button className={"filter-chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>{t.f_all}</button>
        <button className={"filter-chip" + (filter === "ok" ? " active" : "")} onClick={() => setFilter("ok")}>{t.f_ok} <span className="count">{okCount}</span></button>
        <button className={"filter-chip" + (filter === "fallback" ? " active" : "")} onClick={() => setFilter("fallback")}>{t.f_fallback} <span className="count">{fbCount}</span></button>
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }}/>
        <button className={"filter-chip" + (platform === "all" ? " active" : "")} onClick={() => setPlatform("all")}>{lang === "vi" ? "Mọi nguồn" : "All sources"}</button>
        <button className={"filter-chip" + (platform === "web" ? " active" : "")} onClick={() => setPlatform("web")}>{t.f_web}</button>
        <button className={"filter-chip" + (platform === "slack" ? " active" : "")} onClick={() => setPlatform("slack")}>{t.f_slack}</button>
        <button className={"filter-chip" + (platform === "telegram" ? " active" : "")} onClick={() => setPlatform("telegram")}>Telegram</button>
        <button className={"filter-chip" + (platform === "zalo" ? " active" : "")} onClick={() => setPlatform("zalo")}>Zalo</button>
        <div style={{ flex: 1 }}/>
        <div className="search" style={{ flex: "0 0 280px", marginLeft: 0 }}>
          <Icon name="search" size={14}/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search_ph}/>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="col-time">{t.col_time}</th>
                <th className="col-platform">{t.col_platform}</th>
                <th className="col-user">{t.col_user}</th>
                <th>{t.col_question}</th>
                <th className="col-conf">{t.col_conf}</th>
                <th className="col-lat">{t.col_lat}</th>
                <th className="col-status">{t.col_status}</th>
              </tr>
            </thead>
            <tbody>
              {logsQ.loading && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Đang tải…</td></tr>
              )}
              {!logsQ.loading && logs.map((log) => (
                <tr key={log.id} className={selected && selected.id === log.id ? "selected" : ""} onClick={() => setSelected(log)}>
                  <td className="col-time">{relTime(log.timestamp, lang)}</td>
                  <td className="col-platform"><PlatformPill platform={log.platform}/></td>
                  <td className="col-user mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{log.user_id}</td>
                  <td className="truncate" title={log.question}>{log.question}</td>
                  <td className="col-conf"><ConfBar value={log.confidence} fallback={log.is_fallback}/></td>
                  <td className="col-lat">{log.latency_s ? log.latency_s.toFixed(2) + "s" : "—"}</td>
                  <td className="col-status"><StatusPill fallback={log.is_fallback} t={t}/></td>
                </tr>
              ))}
              {!logsQ.loading && logs.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>{lang === "vi" ? "Không có bản ghi phù hợp" : "No matching records"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LogDrawer log={selected} onClose={() => setSelected(null)} t={t} lang={lang} debug={debug}/>
    </div>
  );
}

function LogDrawer({ log, onClose, t, lang, debug }) {
  const isOpen = !!log;
  const [shown, setShown] = useState(log);
  useEffect(() => { if (log) setShown(log); }, [log]);
  const l = shown;

  return (
    <React.Fragment>
      <div className={"drawer-scrim" + (isOpen ? " open" : "")} onClick={onClose}/>
      <aside className={"drawer" + (isOpen ? " open" : "")} aria-hidden={!isOpen}>
        {l && (
          <React.Fragment>
            <div className="drawer-head">
              <div className="h">
                <div className="h-title">{t.drawer_label} · #{l.id}</div>
                <h2>{l.question}</h2>
              </div>
              <button className="btn ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16}/></button>
            </div>
            <div className="drawer-body">
              <div className="section-h">{t.d_meta}</div>
              <div>
                <div className="kv-row"><div className="k">{t.d_time}</div><div className="v mono">{new Date(l.timestamp * 1000).toLocaleString(lang === "vi" ? "vi-VN" : "en-US")}</div></div>
                <div className="kv-row"><div className="k">{t.d_platform}</div><div className="v"><PlatformPill platform={l.platform}/></div></div>
                <div className="kv-row"><div className="k">{t.d_user}</div><div className="v mono">{l.user_id}</div></div>
                <div className="kv-row"><div className="k">{t.d_session}</div><div className="v mono">{l.session_id || "—"}</div></div>
                <div className="kv-row"><div className="k">{t.d_lat}</div><div className="v mono">{l.latency_s ? l.latency_s.toFixed(2) + "s" : "—"}</div></div>
                <div className="kv-row"><div className="k">{t.d_conf}</div><div className="v">{l.is_fallback ? <span className="pill bad"><span className="dot"/>Fallback</span> : <ConfBar value={l.confidence} fallback={false}/>}</div></div>
                <div className="kv-row"><div className="k">{t.d_outcome}</div><div className="v"><StatusPill fallback={l.is_fallback} t={t}/></div></div>
              </div>

              <div className="section-h">{t.d_original}</div>
              <div className="answer-quote">{l.question}</div>

              {debug && (
                <React.Fragment>
                  <div className="section-h debug-only"><Icon name="code" size={13}/> {t.d_rewritten}</div>
                  <div className="answer-quote debug-only mono" style={{ fontSize: 12.5 }}>{l.rewritten_question || "—"}</div>
                </React.Fragment>
              )}

              <div className="section-h">{t.d_answer}</div>
              <div className="answer-quote">{l.answer}</div>

              {l.source_url && (
                <div className="kv-row" style={{ marginTop: 12 }}>
                  <div className="k">{t.d_source}</div>
                  <div className="v"><a href={l.source_url} target="_blank" rel="noopener" style={{ color: "var(--green-700)", fontWeight: 500, display: "inline-flex", gap: 5, alignItems: "center" }}>{l.top_chunk_subject || "Mở"}<Icon name="external" size={11}/></a></div>
                </div>
              )}

              {debug ? (
                <React.Fragment>
                  <div className="section-h debug-only"><Icon name="database" size={13}/> {t.d_chunks}</div>
                  <div className="debug-only">
                    {(l.chunks || []).map((c, i) => (
                      <div key={i} className="chunk">
                        <div className="chunk-head">
                          <span className="chunk-subj">{c.subject || "(no subject)"}</span>
                          <span style={{ flex: 1 }}/>
                          <span className="muted">score</span>
                          <span className="chunk-score">{(c.score || 0).toFixed(3)}</span>
                        </div>
                        <div className="chunk-snippet">{c.snippet || c.text}</div>
                      </div>
                    ))}
                    {(!l.chunks || l.chunks.length === 0) && (
                      <div className="muted" style={{ padding: 12, fontSize: 12 }}>Không có chunks (entry cũ trước khi nâng cấp schema).</div>
                    )}
                  </div>
                </React.Fragment>
              ) : (
                <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--bg-subtle)", border: "1px dashed var(--border-strong)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" }}>
                  <Icon name="code" size={14}/>{t.debug_hidden}
                </div>
              )}
            </div>
          </React.Fragment>
        )}
      </aside>
    </React.Fragment>
  );
}

// ============================================================
// Failing questions page
// ============================================================
function FailingPage({ t, lang }) {
  const failQ = useApi(() => window.ehcApi.failing(50, 7), []);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.failing_title}</div>
          <div className="page-sub">
            {t.failing_sub}
            {failQ.data && <> · <span className="mono tnum">{failQ.data.count}</span> nhóm trong {failQ.data.days} ngày qua</>}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={failQ.refresh}><Icon name="refresh" size={13}/>{t.refresh}</button>
          <button className="btn"><Icon name="download" size={13}/>{t.export}</button>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t.col_question}</th>
                <th className="col-count">{t.col_count}</th>
                <th className="col-conf">{t.col_avg}</th>
                <th className="col-time">{t.col_last}</th>
                <th>{t.col_suggest}</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {failQ.loading && (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Đang tải…</td></tr>
              )}
              {failQ.data && failQ.data.items.map((f, i) => (
                <tr key={i}>
                  <td><span style={{ fontWeight: 500, color: "var(--text-strong)" }}>"{f.question}"</span></td>
                  <td className="col-count" style={{ color: "var(--orange-700)", fontWeight: 600 }}>{f.count}</td>
                  <td className="col-conf"><ConfBar value={f.avg_confidence} fallback={f.any_fallback}/></td>
                  <td className="col-time" style={{ color: "var(--text-muted)" }}>{f.last_seen_human}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{f.suggested}</td>
                  <td><button className="btn sm green" onClick={(e) => e.stopPropagation()}>{t.write_faq}<Icon name="external" size={11}/></button></td>
                </tr>
              ))}
              {failQ.data && failQ.data.items.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Không có câu hỏi fail. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Eval page
// ============================================================
function EvalPage({ t, lang }) {
  const evalQ = useApi(() => window.ehcApi.evalResults(), []);
  const [category, setCategory] = useState("all");
  const [running, setRunning] = useState(false);

  const onRunEval = async () => {
    setRunning(true);
    try {
      await window.ehcApi.runEval();
      setTimeout(() => { evalQ.refresh(); setRunning(false); }, 3000);
    } catch {
      setRunning(false);
    }
  };

  if (evalQ.loading) return <LoadingShell t={t} title={t.eval_title} sub={t.eval_sub}/>;
  if (evalQ.error || !evalQ.data || !evalQ.data.latest) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">{t.eval_title}</div>
            <div className="page-sub">{t.eval_sub}</div>
          </div>
          <div className="page-actions">
            <button className="btn primary" onClick={onRunEval}><Icon name="play" size={13}/>{t.run_eval}</button>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          {lang === "vi" ? "Chưa có kết quả eval. Chạy `python -m tests.evaluate --write` hoặc bấm 'Chạy eval'." : "No eval results yet. Run `python -m tests.evaluate --write` or click 'Run eval'."}
        </div>
      </div>
    );
  }

  const latest = evalQ.data.latest;
  const history = evalQ.data.history || [];

  const catKey = (c) => c.type === "in_faq" ? "in-faq" : c.type === "not_in_faq" ? "fallback" : c.type === "colloquial" ? "colloquial" : "ambiguous";
  const cases = (latest.cases || []).filter((c) => category === "all" || catKey(c) === category);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.eval_title}</div>
          <div className="page-sub">{t.eval_sub} · {t.last_run}: <span className="mono">{latest.last_run}</span></div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={evalQ.refresh}><Icon name="refresh" size={13}/>{t.refresh}</button>
          <button className="btn primary" onClick={onRunEval} disabled={running}>
            <Icon name={running ? "refresh" : "play"} size={13}/>
            {running ? (lang === "vi" ? "Đang chạy…" : "Running…") : t.run_eval}
          </button>
        </div>
      </div>

      <div className="eval-summary">
        <EvalStat label={t.eval_overall}    num={latest.total_passed}              denom={latest.total}/>
        <EvalStat label={t.eval_infaq}      num={latest.by_category.in_faq.passed}     denom={latest.by_category.in_faq.total}/>
        <EvalStat label={t.eval_colloquial} num={latest.by_category.colloquial.passed} denom={latest.by_category.colloquial.total}/>
        <EvalStat label={t.eval_fallback}   num={latest.by_category.not_in_faq.passed} denom={latest.by_category.not_in_faq.total}/>
        <EvalStat label={t.eval_ambig}      num={latest.by_category.ambiguous.passed}  denom={latest.by_category.ambiguous.total}/>
      </div>

      <div className="grid-2 even">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.eval_pass_rate} · {t.eval_history}</div>
              <div className="card-sub">{lang === "vi" ? "% câu test pass — các lần chạy gần nhất" : "% test cases passing — recent runs"}</div>
            </div>
          </div>
          <div className="card-body">
            {history.length > 0
              ? <PassHistoryChart history={history.slice(-7)}/>
              : <div className="muted" style={{ padding: 30, textAlign: "center" }}>Chưa có lịch sử</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.eval_avg_lat} · {t.eval_history}</div>
              <div className="card-sub">{lang === "vi" ? "Thời gian trung bình mỗi câu test (giây)" : "Average seconds per test case"}</div>
            </div>
          </div>
          <div className="card-body">
            {history.length > 0
              ? <BarChart values={history.slice(-7).map((h) => h.avg_latency)} labels={history.slice(-7).map((h) => h.date)} color="oklch(0.65 0.11 152)" height={160}/>
              : <div className="muted" style={{ padding: 30, textAlign: "center" }}>Chưa có lịch sử</div>}
          </div>
        </div>
      </div>

      <div className="filters" style={{ marginTop: 18 }}>
        {["all","in-faq","colloquial","fallback","ambiguous"].map((c) => (
          <button key={c} className={"filter-chip" + (category === c ? " active" : "")} onClick={() => setCategory(c)}>
            {c === "all" ? t.f_all : c === "in-faq" ? t.cat_in_faq : c === "colloquial" ? t.cat_colloquial : c === "fallback" ? t.cat_fallback : t.cat_ambiguous}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 110 }}>{t.col_category}</th>
                <th>{t.col_case}</th>
                <th>{t.col_expected}</th>
                <th>{t.col_actual}</th>
                <th className="col-lat">{t.col_lat}</th>
                <th className="col-status">{t.col_status}</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => {
                const k = catKey(c);
                const catLabel = k === "in-faq" ? t.cat_in_faq : k === "fallback" ? t.cat_fallback : k === "colloquial" ? t.cat_colloquial : t.cat_ambiguous;
                return (
                  <tr key={c.id || i}>
                    <td className="mono" style={{ color: "var(--text-muted)", fontSize: 12 }}>{String(c.id || (i + 1)).slice(-3)}</td>
                    <td><span className="pill muted">{catLabel}</span></td>
                    <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{c.question}</td>
                    <td className="mono" style={{ color: "var(--text-muted)", fontSize: 12 }}>{c.expected_faq_subject || c.expected_behavior || c.expected || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.actual_top_subject || (c.is_fallback ? "fallback" : "—")}</td>
                    <td className="col-lat">{(c.elapsed || 0).toFixed(2)}s</td>
                    <td className="col-status">
                      {c.passed
                        ? <span className="pill ok"><Icon name="check-circle" size={11}/>{t.pass}</span>
                        : <span className="pill bad"><span className="dot"/>{t.fail}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvalStat({ label, num, denom }) {
  const pct = denom > 0 ? (num / denom) * 100 : 0;
  return (
    <div className="eval-stat">
      <div className="lbl">{label}</div>
      <div className="val tnum">{num}<span className="denom">/{denom}</span></div>
      <div className="pass-pct" style={pct < 80 ? { color: "var(--bad)" } : pct < 100 ? { color: "var(--warn)" } : {}}>{pct.toFixed(0)}% pass</div>
    </div>
  );
}

function PassHistoryChart({ history }) {
  const w = 100;
  const h = 160;
  const padX = 14;
  const padTop = 10;
  const padBot = 22;
  if (history.length < 2) {
    return <div className="muted" style={{ padding: 30, textAlign: "center" }}>Cần ít nhất 2 lần chạy</div>;
  }
  const innerW = (w * history.length) - padX * 2;
  const innerH = h - padTop - padBot;
  const points = history.map((p, i) => {
    const x = padX + (i * (innerW / (history.length - 1)));
    const y = padTop + innerH - (p.pass_rate * innerH);
    return [x, y, p];
  });
  const d = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const totalW = w * history.length;
  return (
    <svg viewBox={`0 0 ${totalW} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
      {[0, 0.5, 1].map((t) => {
        const y = padTop + innerH - (t * innerH);
        return <g key={t}>
          <line x1="0" y1={y} x2={totalW} y2={y} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="0.5"/>
          <text x="2" y={y - 2} fontSize="9" fill="var(--text-soft)" fontFamily="var(--font-mono)">{(t * 100).toFixed(0)}%</text>
        </g>;
      })}
      <path d={`${d} L${points[points.length-1][0]},${padTop+innerH} L${points[0][0]},${padTop+innerH} Z`} fill="var(--green-500)" opacity="0.1"/>
      <path d={d} stroke="var(--green-700)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3" fill="var(--green-700)"/>
          <text x={p[0]} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--text-soft)" fontFamily="var(--font-mono)">{p[2].date}</text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================
// System page
// ============================================================
function SystemPage({ t, lang, onReindex, reindexState }) {
  const sysQ = useApi(() => window.ehcApi.systemStatus(), []);
  const [maintenance, setMaintenance] = useState(false);
  const [maintToken, setMaintToken] = useState(() => localStorage.getItem("ehcAdminToken") || "");
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);

  useEffect(() => {
    if (sysQ.data) setMaintenance(!!sysQ.data.maintenance_mode);
  }, [sysQ.data]);

  const onToggleMaint = async () => {
    if (!maintToken) { setShowTokenPrompt(true); return; }
    const next = !maintenance;
    try {
      const r = await window.ehcApi.setMaintenance(next, maintToken);
      if (r.status === "ok") {
        setMaintenance(r.maintenance_mode);
        localStorage.setItem("ehcAdminToken", maintToken);
      } else {
        alert(r.detail || "Failed");
      }
    } catch (e) { alert(String(e)); }
  };

  if (sysQ.loading) return <LoadingShell t={t} title={t.system_title} sub={t.system_sub}/>;
  if (sysQ.error) return <ErrorCard error={sysQ.error} retry={sysQ.refresh}/>;
  const s = sysQ.data;

  const statusBadge = (st) => {
    if (st === "healthy" || st === "loaded") return "ok";
    if (st === "degraded" || st === "unknown") return "warn";
    return "bad";
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.system_title}</div>
          <div className="page-sub">{t.system_sub}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={sysQ.refresh}><Icon name="refresh" size={13}/>{t.refresh}</button>
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 0, marginBottom: 12, color: "var(--text-strong)", textTransform: "none", fontSize: 13.5, letterSpacing: 0 }}>
        <Icon name="server" size={14}/> {t.services}
      </div>
      <div className="health-grid mb-18">
        <HealthCard
          name="FastAPI"
          sub="api.routes:app"
          rows={[
            [t.uptime, s.fastapi.uptime || "—"],
            [lang === "vi" ? "Trạng thái" : "Status", s.fastapi.status],
          ]}
          status={s.fastapi.status}
          tone={statusBadge(s.fastapi.status)}
          tStatus={t.healthy}
        />
        <HealthCard
          name="vLLM"
          sub={s.vllm.model || "—"}
          rows={[
            [lang === "vi" ? "URL" : "URL", s.vllm.url || "—"],
            [lang === "vi" ? "Trạng thái" : "Status", s.vllm.status],
            s.vllm.error ? ["error", s.vllm.error] : ["", ""],
          ]}
          status={s.vllm.status}
          tone={statusBadge(s.vllm.status)}
          tStatus={t.healthy}
        />
        <HealthCard
          name="Qdrant"
          sub={`${s.qdrant.collection} · ${fmtNum(s.qdrant.points_count || 0)} ${t.points.toLowerCase()}`}
          rows={[
            [t.collection, s.qdrant.collection],
            [lang === "vi" ? "Indexed" : "Indexed", fmtNum(s.qdrant.indexed_vectors_count || 0)],
            [lang === "vi" ? "Trạng thái" : "Status", s.qdrant.status],
          ]}
          status={s.qdrant.status}
          tone={statusBadge(s.qdrant.status)}
          tStatus={t.healthy}
        />
        <HealthCard
          name="bge-m3 (embedder)"
          sub={s.embedder.model}
          rows={[
            [t.device, s.embedder.device],
            [lang === "vi" ? "Trạng thái" : "Status", s.embedder.status],
          ]}
          status={s.embedder.status}
          tone={statusBadge(s.embedder.status)}
          tStatus={t.healthy}
        />
        <HealthCard
          name="bge-reranker-v2-m3"
          sub={s.reranker.model}
          rows={[
            [t.device, s.reranker.device],
            [lang === "vi" ? "Trạng thái" : "Status", s.reranker.status],
          ]}
          status={s.reranker.status}
          tone={statusBadge(s.reranker.status)}
          tStatus={t.healthy}
        />
        <HealthCard
          name="Redmine FAQ"
          sub={`${s.redmine.project} project`}
          rows={[
            [t.last_reindex, s.redmine.last_reindex || "—"],
            [lang === "vi" ? "URL" : "URL", s.redmine.url || "—"],
          ]}
          status={s.redmine.status}
          tone={statusBadge(s.redmine.status)}
          tStatus={t.healthy}
        />
      </div>

      <div className="section-h" style={{ marginTop: 0, marginBottom: 12, color: "var(--text-strong)", textTransform: "none", fontSize: 13.5, letterSpacing: 0 }}>
        <Icon name="server" size={14}/> {t.operations}
      </div>
      <div className="grid-2 even">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.op_reindex_title}</div>
              <div className="card-sub">{t.op_reindex_desc}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="row-flex between" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>{t.last_reindex}: <span className="mono">{s.redmine.last_reindex || "—"}</span></div>
              {reindexState === "running" && <span className="pill warn"><span className="dot"/>{lang === "vi" ? "Đang chạy..." : "Running..."}</span>}
              {reindexState === "done" && <span className="pill ok"><Icon name="check-circle" size={11}/>{lang === "vi" ? "Đã trigger" : "Triggered"}</span>}
            </div>
            <button className="btn primary" onClick={onReindex} disabled={reindexState === "running"}>
              <Icon name="refresh" size={13}/>
              {reindexState === "running" ? (lang === "vi" ? "Đang reindex..." : "Reindexing...") : t.reindex}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.op_maint_title}</div>
              <div className="card-sub">{t.op_maint_desc}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="row-flex between" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>{lang === "vi" ? "Trạng thái hiện tại" : "Current state"}</div>
              {maintenance
                ? <span className="pill warn"><span className="dot"/>{lang === "vi" ? "Đang bật" : "Active"}</span>
                : <span className="pill ok"><span className="dot"/>{lang === "vi" ? "Đang tắt" : "Off"}</span>}
            </div>
            {showTokenPrompt && (
              <div style={{ marginBottom: 10 }}>
                <input
                  type="password"
                  className="mono"
                  placeholder="ADMIN_TOKEN"
                  value={maintToken}
                  onChange={(e) => setMaintToken(e.target.value)}
                  style={{ width: "100%", height: 32, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                />
              </div>
            )}
            <button className={"btn " + (maintenance ? "danger" : "")} onClick={onToggleMaint}>
              <Icon name={maintenance ? "pause" : "play"} size={13}/>
              {maintenance ? (lang === "vi" ? "Tắt bảo trì" : "Disable maintenance") : (lang === "vi" ? "Bật bảo trì" : "Enable maintenance")}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{lang === "vi" ? "Caches" : "Caches"}</div>
              <div className="card-sub">{lang === "vi" ? "LRU caches: rewrite, retrieval, answer" : "LRU caches: rewrite, retrieval, answer"}</div>
            </div>
          </div>
          <div className="card-body">
            {s.cache_sizes && Object.keys(s.cache_sizes).length > 0 ? (
              <table style={{ width: "100%", fontSize: 12.5 }}>
                <tbody>
                  {Object.entries(s.cache_sizes).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>{k}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{JSON.stringify(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>—</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{lang === "vi" ? "Logs nội bộ" : "Service logs"}</div>
              <div className="card-sub">{lang === "vi" ? "Theo dõi systemd journal" : "Tail systemd journal"}</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <code style={{ fontSize: 11.5, padding: "4px 8px", background: "var(--bg-subtle)", borderRadius: 4, fontFamily: "var(--font-mono)" }}>journalctl -u ehc-vllm -f</code>
              <code style={{ fontSize: 11.5, padding: "4px 8px", background: "var(--bg-subtle)", borderRadius: 4, fontFamily: "var(--font-mono)" }}>journalctl -u ehc-helpdesk -f</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ name, sub, rows, status, tone, tStatus }) {
  const dotColor = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
  const shadow = tone === "ok" ? "0 0 0 4px oklch(0.9 0.08 152 / 0.4)"
              : tone === "warn" ? "0 0 0 4px oklch(0.92 0.10 78 / 0.35)"
              : "0 0 0 4px oklch(0.92 0.10 28 / 0.35)";
  return (
    <div className="health-card">
      <div className="h">
        <div className="status-dot" style={{ background: dotColor, boxShadow: shadow }}/>
        <div style={{ flex: 1 }}>
          <div className="name">{name}</div>
          <div className="muted" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)" }}>{sub}</div>
        </div>
        <span className={"pill " + tone} style={{ fontSize: 10 }}>{status}</span>
      </div>
      <div>
        {rows.map((r, i) => r[0] && (
          <div key={i} className="health-row">
            <span className="k">{r[0]}</span>
            <span className="v">{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { OverviewPage, LogsPage, FailingPage, EvalPage, SystemPage });
