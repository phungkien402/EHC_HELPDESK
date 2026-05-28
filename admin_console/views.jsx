// View pages for EHC Helpdesk Admin

// ============================================================
// Overview
// ============================================================
function OverviewPage({ t, lang, data, onOpenLogs, onOpenFailing }) {
  const m = data.metrics;
  const dVol = m.totalToday - m.totalYesterday;
  const dFb = m.fallbackRate - m.fallbackRateY;
  const dLat = m.avgLatency - m.avgLatencyY;
  const dUsr = m.activeUsers - m.activeUsersY;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.overview_title}</div>
          <div className="page-sub">{t.overview_sub}</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={14}/>{t.export}</button>
          <button className="btn primary"><Icon name="play" size={14}/>{t.run_eval}</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-row">
        <KpiCard
          label={t.kpi_volume}
          value={fmtNum(m.totalToday)}
          delta={dVol}
          deltaFmt={(v) => (v > 0 ? "+" : "") + v}
          spark={m.sparkVolume}
          unit=""
          subTxt={t.vs_yesterday}
          goodIsUp
        />
        <KpiCard
          label={t.kpi_fallback}
          value={fmtPct(m.fallbackRate)}
          delta={dFb}
          deltaFmt={(v) => (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "pt"}
          spark={m.sparkFallback}
          subTxt={t.vs_yesterday}
          color="oklch(0.7 0.17 48)"
        />
        <KpiCard
          label={t.kpi_latency}
          value={m.avgLatency.toFixed(2)}
          unit="s"
          delta={dLat}
          deltaFmt={(v) => (v > 0 ? "+" : "") + v.toFixed(2) + "s"}
          spark={m.sparkLatency}
          subTxt={`p95 ${m.p95Latency.toFixed(1)}s`}
        />
        <KpiCard
          label={t.kpi_users}
          value={fmtNum(m.activeUsers)}
          delta={dUsr}
          deltaFmt={(v) => (v > 0 ? "+" : "") + v}
          spark={[28, 32, 30, 35, 33, 38, 34, 38]}
          subTxt={t.vs_yesterday}
          goodIsUp
        />
      </div>

      {/* Charts row */}
      <div className="grid-2">
        {/* Confidence distribution */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.conf_dist_title}</div>
              <div className="card-sub">{t.conf_dist_sub}</div>
            </div>
            <div className="card-actions">
              <span className="pill ok"><span className="dot"/>OK</span>
              <span className="pill bad"><span className="dot"/>Fallback</span>
            </div>
          </div>
          <div className="card-body">
            <ConfidenceDistribution dist={data.confDist} fbDist={data.confDistFallback}/>
          </div>
        </div>

        {/* Volume */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.volume_title}</div>
              <div className="card-sub">{t.volume_sub}</div>
            </div>
          </div>
          <div className="card-body">
            <BarChart values={m.sparkVolume} labels={["28d", "21d", "14d", "7d", "0d"]} color="var(--green-500)" height={160}/>
          </div>
        </div>
      </div>

      {/* Top failing preview */}
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
          {data.failing.slice(0, 4).map((f, i) => (
            <div key={i} className="fail-row">
              <div>
                <div className="q">"{f.q}"</div>
                <div className="meta">{f.suggested} · {t.col_last}: {f.lastSeen}</div>
              </div>
              <div>
                <div className="count">{f.count}</div>
                <div className="count-lbl">hits</div>
              </div>
              <div>
                <ConfBar value={f.avgConf} fallback={false}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, delta, deltaFmt, spark, subTxt, color, goodIsUp }) {
  const isUp = delta > 0;
  // For latency / fallback: down = good. For volume / users (goodIsUp): up = good.
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
        <Sparkline values={spark} color={color || "var(--green-500)"} fill/>
      </div>
    </div>
  );
}

function ConfidenceDistribution({ dist, fbDist }) {
  const total = dist.reduce((a, b) => a + b, 0) + fbDist.reduce((a, b) => a + b, 0);
  const max = Math.max(...dist.map((v, i) => v + fbDist[i]));
  const labels = ["0.0-0.1", "0.1-0.2", "0.2-0.3", "0.3-0.4", "0.4-0.5", "0.5-0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0"];
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
        n = {total} · threshold = 0.40 · median = 0.82
      </div>
    </div>
  );
}

// ============================================================
// Logs page
// ============================================================
function LogsPage({ t, lang, data, debug }) {
  const [filter, setFilter] = useState("all"); // all | ok | fallback
  const [platform, setPlatform] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    return data.logs.filter((l) => {
      if (filter === "ok" && l.is_fallback) return false;
      if (filter === "fallback" && !l.is_fallback) return false;
      if (platform !== "all" && l.platform !== platform) return false;
      if (search && !(l.question.toLowerCase().includes(search.toLowerCase()) || l.user.includes(search))) return false;
      return true;
    });
  }, [filter, platform, search, data.logs]);

  const okCount = data.logs.filter((l) => !l.is_fallback).length;
  const fbCount = data.logs.filter((l) => l.is_fallback).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.logs_title}</div>
          <div className="page-sub">{t.logs_sub} · <span className="mono tnum">{data.logs.length}</span> {lang === "vi" ? "bản ghi" : "records"}</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={13}/>{t.refresh}</button>
          <button className="btn"><Icon name="download" size={13}/>{t.export}</button>
        </div>
      </div>

      <div className="filters">
        <button className={"filter-chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>
          {t.f_all} <span className="count">{data.logs.length}</span>
        </button>
        <button className={"filter-chip" + (filter === "ok" ? " active" : "")} onClick={() => setFilter("ok")}>
          {t.f_ok} <span className="count">{okCount}</span>
        </button>
        <button className={"filter-chip" + (filter === "fallback" ? " active" : "")} onClick={() => setFilter("fallback")}>
          {t.f_fallback} <span className="count">{fbCount}</span>
        </button>
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }}/>
        <button className={"filter-chip" + (platform === "all" ? " active" : "")} onClick={() => setPlatform("all")}>
          {lang === "vi" ? "Mọi nguồn" : "All sources"}
        </button>
        <button className={"filter-chip" + (platform === "web" ? " active" : "")} onClick={() => setPlatform("web")}>
          {t.f_web}
        </button>
        <button className={"filter-chip" + (platform === "slack" ? " active" : "")} onClick={() => setPlatform("slack")}>
          {t.f_slack}
        </button>
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
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  className={selected && selected.id === log.id ? "selected" : ""}
                  onClick={() => setSelected(log)}
                >
                  <td className="col-time">{relTime(log.timestamp, lang)}</td>
                  <td className="col-platform"><PlatformPill platform={log.platform}/></td>
                  <td className="col-user mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{log.user}</td>
                  <td className="truncate" title={log.question}>{log.question}</td>
                  <td className="col-conf"><ConfBar value={log.confidence} fallback={log.is_fallback}/></td>
                  <td className="col-lat">{log.latency_s.toFixed(2)}s</td>
                  <td className="col-status"><StatusPill fallback={log.is_fallback} t={t}/></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                  {lang === "vi" ? "Không có bản ghi phù hợp" : "No matching records"}
                </td></tr>
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
  // keep last log in state so closing transition looks right
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
                <div className="kv-row"><div className="k">{t.d_user}</div><div className="v mono">{l.user}</div></div>
                <div className="kv-row"><div className="k">{t.d_session}</div><div className="v mono">{l.session}</div></div>
                <div className="kv-row"><div className="k">{t.d_lat}</div><div className="v mono">{l.latency_s.toFixed(2)}s</div></div>
                <div className="kv-row"><div className="k">{t.d_conf}</div><div className="v">{l.is_fallback ? <span className="pill bad"><span className="dot"/>Fallback</span> : <ConfBar value={l.confidence} fallback={false}/>}</div></div>
                <div className="kv-row"><div className="k">{t.d_outcome}</div><div className="v"><StatusPill fallback={l.is_fallback} t={t}/></div></div>
              </div>

              <div className="section-h">{t.d_original}</div>
              <div className="answer-quote">{l.question}</div>

              {debug ? (
                <React.Fragment>
                  <div className="section-h debug-only">
                    <Icon name="code" size={13}/> {t.d_rewritten}
                  </div>
                  <div className="answer-quote debug-only mono" style={{ fontSize: 12.5 }}>{l.rewritten}</div>
                </React.Fragment>
              ) : null}

              <div className="section-h">{t.d_answer}</div>
              <div className="answer-quote">{l.answer}</div>

              {l.source_url && (
                <div className="kv-row" style={{ marginTop: 12 }}>
                  <div className="k">{t.d_source}</div>
                  <div className="v"><a href={l.source_url} target="_blank" rel="noopener" style={{ color: "var(--green-700)", fontWeight: 500, display: "inline-flex", gap: 5, alignItems: "center" }}>{l.top_chunk}<Icon name="external" size={11}/></a></div>
                </div>
              )}

              {debug ? (
                <React.Fragment>
                  <div className="section-h debug-only">
                    <Icon name="database" size={13}/> {t.d_chunks}
                  </div>
                  <div className="debug-only">
                    {l.chunks.map((c, i) => (
                      <div key={i} className="chunk">
                        <div className="chunk-head">
                          <span className="chunk-subj">{c.subject}</span>
                          <span style={{ flex: 1 }}/>
                          <span className="muted">score</span>
                          <span className="chunk-score">{c.score.toFixed(3)}</span>
                        </div>
                        <div className="chunk-snippet">{c.snippet}</div>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ) : (
                <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--bg-subtle)", border: "1px dashed var(--border-strong)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" }}>
                  <Icon name="code" size={14}/>
                  {t.debug_hidden}
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
function FailingPage({ t, lang, data }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.failing_title}</div>
          <div className="page-sub">{t.failing_sub}</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={13}/>{t.export}</button>
          <button className="btn green"><Icon name="sparkles" size={13}/>{lang === "vi" ? "Gợi ý FAQ bằng AI" : "Suggest FAQs with AI"}</button>
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
              {data.failing.map((f, i) => (
                <tr key={i}>
                  <td><span style={{ fontWeight: 500, color: "var(--text-strong)" }}>"{f.q}"</span></td>
                  <td className="col-count" style={{ color: "var(--orange-700)", fontWeight: 600 }}>{f.count}</td>
                  <td className="col-conf"><ConfBar value={f.avgConf} fallback={false}/></td>
                  <td className="col-time" style={{ color: "var(--text-muted)" }}>{f.lastSeen}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{f.suggested}</td>
                  <td><button className="btn sm green" onClick={(e) => e.stopPropagation()}>{t.write_faq}<Icon name="external" size={11}/></button></td>
                </tr>
              ))}
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
function EvalPage({ t, lang, data }) {
  const e = data.evals;
  const s = e.summary;
  const [category, setCategory] = useState("all");

  const cases = e.cases.filter((c) => category === "all" || c.category === category);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.eval_title}</div>
          <div className="page-sub">{t.eval_sub} · {t.last_run}: <span className="mono">{s.lastRun}</span></div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={13}/>{t.export}</button>
          <button className="btn primary"><Icon name="play" size={13}/>{t.run_eval}</button>
        </div>
      </div>

      <div className="eval-summary">
        <EvalStat label={t.eval_overall} num={s.inFaqPass + s.colloquialPass + s.fallbackPass + s.ambiguousPass} denom={s.inFaqTotal + s.colloquialTotal + s.fallbackTotal + s.ambiguousTotal}/>
        <EvalStat label={t.eval_infaq} num={s.inFaqPass} denom={s.inFaqTotal}/>
        <EvalStat label={t.eval_colloquial} num={s.colloquialPass} denom={s.colloquialTotal}/>
        <EvalStat label={t.eval_fallback} num={s.fallbackPass} denom={s.fallbackTotal}/>
        <EvalStat label={t.eval_ambig} num={s.ambiguousPass} denom={s.ambiguousTotal}/>
      </div>

      <div className="grid-2 even">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.eval_pass_rate} · {t.eval_history}</div>
              <div className="card-sub">{lang === "vi" ? "% câu test pass — 7 ngày gần nhất" : "% test cases passing — last 7 runs"}</div>
            </div>
          </div>
          <div className="card-body">
            <PassHistoryChart history={e.history}/>
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
            <BarChart values={e.history.map((h) => h.lat)} labels={e.history.map((h) => h.date)} color="oklch(0.65 0.11 152)" height={160}/>
          </div>
        </div>
      </div>

      <div className="filters" style={{ marginTop: 18 }}>
        {["all", "in-faq", "colloquial", "fallback", "ambiguous"].map((c) => (
          <button key={c} className={"filter-chip" + (category === c ? " active" : "")} onClick={() => setCategory(c)}>
            {c === "all" ? t.f_all : (c === "in-faq" ? t.cat_in_faq : c === "colloquial" ? t.cat_colloquial : c === "fallback" ? t.cat_fallback : t.cat_ambiguous)}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 110 }}>{t.col_category}</th>
                <th>{t.col_case}</th>
                <th>{t.col_expected}</th>
                <th>{t.col_actual}</th>
                <th className="col-lat">{t.col_lat}</th>
                <th className="col-status">{t.col_status}</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="mono" style={{ color: "var(--text-muted)" }}>{String(c.id).padStart(2, "0")}</td>
                  <td><span className="pill muted">{c.category === "in-faq" ? t.cat_in_faq : c.category === "colloquial" ? t.cat_colloquial : c.category === "fallback" ? t.cat_fallback : t.cat_ambiguous}</span></td>
                  <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{c.q}</td>
                  <td className="mono" style={{ color: "var(--text-muted)", fontSize: 12 }}>{c.expected}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.actual}</td>
                  <td className="col-lat">{c.lat.toFixed(2)}s</td>
                  <td className="col-status">
                    {c.status === "pass"
                      ? <span className="pill ok"><Icon name="check-circle" size={11}/>{t.pass}</span>
                      : <span className="pill bad"><span className="dot"/>{t.fail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvalStat({ label, num, denom }) {
  const pct = (num / denom) * 100;
  return (
    <div className="eval-stat">
      <div className="lbl">{label}</div>
      <div className="val tnum">{num}<span className="denom">/{denom}</span></div>
      <div className="pass-pct">{pct.toFixed(0)}% pass</div>
    </div>
  );
}

function PassHistoryChart({ history }) {
  const w = 100;
  const h = 160;
  const padX = 8;
  const padTop = 10;
  const padBot = 22;
  const innerW = (w * history.length) - padX * 2;
  const innerH = h - padTop - padBot;
  const points = history.map((p, i) => {
    const x = padX + (i * (innerW / (history.length - 1)));
    const y = padTop + innerH - (p.pass * innerH);
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
function SystemPage({ t, lang, data, maintenance, setMaintenance, onReindex, reindexState }) {
  const s = data.system;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{t.system_title}</div>
          <div className="page-sub">{t.system_sub}</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={13}/>{t.refresh}</button>
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 0, marginBottom: 12, color: "var(--text-strong)", textTransform: "none", fontSize: 13.5, letterSpacing: 0 }}>
        <Icon name="server" size={14}/> {t.services}
      </div>
      <div className="health-grid mb-18">
        <HealthCard
          name="vLLM"
          sub={s.vllm.model}
          rows={[
            [t.uptime, s.vllm.uptime],
            [t.port, ":" + s.vllm.port],
            [t.vram, s.vllm.vram],
          ]}
          status={t.healthy}
        />
        <HealthCard
          name="Qdrant"
          sub={s.qdrant.collection + " · " + fmtNum(s.qdrant.points) + " " + t.points.toLowerCase()}
          rows={[
            [t.uptime, s.qdrant.uptime],
            [t.port, ":" + s.qdrant.port],
            [t.collection, s.qdrant.collection],
          ]}
          status={t.healthy}
        />
        <HealthCard
          name="FastAPI"
          sub="api.routes:app"
          rows={[
            [t.uptime, s.api.uptime],
            [t.port, ":" + s.api.port],
            [t.requests24h, fmtNum(s.api.requests24h)],
          ]}
          status={t.healthy}
        />
        <HealthCard
          name="bge-m3 (embedder)"
          sub={s.embedder.model}
          rows={[
            [t.device, s.embedder.device],
            [lang === "vi" ? "Lần embed cuối" : "Last embed", s.embedder.lastEmbed],
          ]}
          status={t.healthy}
        />
        <HealthCard
          name="bge-reranker-v2-m3"
          sub={s.reranker.model}
          rows={[
            [t.device, s.reranker.device],
            ["", ""],
          ]}
          status={t.healthy}
        />
        <HealthCard
          name="Redmine FAQ"
          sub={"ehcfaq project · 464 entries"}
          rows={[
            [t.last_reindex, s.lastReindex],
            [lang === "vi" ? "Trạng thái" : "Status", lang === "vi" ? "Đã đồng bộ" : "Synced"],
          ]}
          status={t.healthy}
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
              <div className="muted" style={{ fontSize: 12 }}>{t.last_reindex}: <span className="mono">{s.lastReindex}</span></div>
              {reindexState === "running" && <span className="pill warn"><span className="dot"/>{lang === "vi" ? "Đang chạy..." : "Running..."}</span>}
              {reindexState === "done" && <span className="pill ok"><Icon name="check-circle" size={11}/>{lang === "vi" ? "Hoàn tất" : "Done"}</span>}
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
            <button
              className={"btn " + (maintenance ? "danger" : "")}
              onClick={() => setMaintenance(!maintenance)}
            >
              <Icon name={maintenance ? "pause" : "play"} size={13}/>
              {maintenance ? (lang === "vi" ? "Tắt bảo trì" : "Disable maintenance") : (lang === "vi" ? "Bật bảo trì" : "Enable maintenance")}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t.op_backup_title}</div>
              <div className="card-sub">{t.op_backup_desc}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="row-flex between" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>{lang === "vi" ? "Backup gần nhất" : "Last backup"}: <span className="mono">2026-05-27 02:00</span></div>
            </div>
            <button className="btn"><Icon name="download" size={13}/>{lang === "vi" ? "Tạo snapshot" : "Create snapshot"}</button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{lang === "vi" ? "Logs nội bộ" : "Service logs"}</div>
              <div className="card-sub">{lang === "vi" ? "Theo dõi systemd journal cho vLLM và API" : "Tail systemd journal for vLLM and the API server"}</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn"><Icon name="list" size={13}/>journalctl -u ehc-vllm</button>
              <button className="btn"><Icon name="list" size={13}/>journalctl -u ehc-helpdesk</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ name, sub, rows, status }) {
  return (
    <div className="health-card">
      <div className="h">
        <div className="status-dot"/>
        <div style={{ flex: 1 }}>
          <div className="name">{name}</div>
          <div className="muted" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)" }}>{sub}</div>
        </div>
        <span className="pill ok" style={{ fontSize: 10 }}>{status}</span>
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

// WorkflowPage

function PathPill({ path, t }) {
  const map = {
    cache_hit: { label: t.wf_cache_label, cls: "pill wf-cache" },
    shortcut:  { label: t.wf_shortcut_label, cls: "pill wf-shortcut" },
    full:      { label: t.wf_full_label, cls: "pill wf-full" },
    fallback:  { label: t.wf_fallback_label, cls: "pill bad" },
  };
  const { label, cls } = map[path] || { label: path, cls: "pill" };
  return <span className={cls}><span className="dot"/>{label}</span>;
}

function StageBar({ stages, totalMs, t }) {
  const stageDefs = [
    { key: "fast_retrieve_ms", label: t.wf_stage_fast,     color: "#38bdf8" },
    { key: "classify_ms",      label: t.wf_stage_classify,  color: "#a78bfa" },
    { key: "rewrite_ms",       label: t.wf_stage_rewrite,   color: "#fb923c" },
    { key: "retrieve_ms",      label: t.wf_stage_retrieve,  color: "#34d399" },
    { key: "rerank_ms",        label: t.wf_stage_rerank,    color: "#f472b6" },
    { key: "generate_ms",      label: t.wf_stage_generate,  color: "#fbbf24" },
  ];
  const active = stageDefs.filter((s) => stages[s.key] != null);
  const barTotal = active.reduce((acc, s) => acc + stages[s.key], 0) || 1;

  return (
    <div className="wf-stage-wrap">
      <div className="wf-bar-track">
        {active.map((s) => {
          const pct = (stages[s.key] / barTotal) * 100;
          return (
            <div key={s.key} className="wf-bar-seg"
                 style={{ width: pct + "%", background: s.color }}
                 title={`${s.label}: ${stages[s.key]}ms`}/>
          );
        })}
      </div>
      <div className="wf-stage-legend">
        {active.map((s) => (
          <div key={s.key} className="wf-stage-row">
            <span className="wf-stage-dot" style={{ background: s.color }}/>
            <span className="wf-stage-name">{s.label}</span>
            <span className="wf-stage-ms tnum">{stages[s.key]}ms</span>
            <span className="wf-stage-pct tnum">{((stages[s.key] / barTotal) * 100).toFixed(0)}%</span>
          </div>
        ))}
        <div className="wf-stage-total">
          <span>{t.wf_total}</span>
          <span className="tnum">{totalMs}ms</span>
        </div>
      </div>
    </div>
  );
}

function WorkflowPage({ t, lang, data }) {
  const [pathFilter, setPathFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => {
    return data.workflow.filter((r) => pathFilter === "all" || r.path === pathFilter);
  }, [data.workflow, pathFilter]);

  const allWf = data.workflow;
  const cacheHits = allWf.filter((r) => r.path === "cache_hit").length;
  const cacheRate = allWf.length ? ((cacheHits / allWf.length) * 100).toFixed(0) : 0;
  const genRows = allWf.filter((r) => r.tok_per_sec != null);
  const avgTokPs = genRows.length
    ? (genRows.reduce((a, r) => a + r.tok_per_sec, 0) / genRows.length).toFixed(1)
    : "---";
  const avgLat = (allWf.reduce((a, r) => a + r.total_ms, 0) / (allWf.length || 1) / 1000).toFixed(2);

  const filterTabs = [
    { key: "all",       label: t.wf_all },
    { key: "cache_hit", label: t.wf_cache },
    { key: "shortcut",  label: t.wf_shortcut },
    { key: "full",      label: t.wf_full },
    { key: "fallback",  label: t.wf_fallback },
  ];

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <h1>{t.wf_title}</h1>
          <p className="sub">{t.wf_sub}</p>
        </div>
      </div>

      <div className="kpi-row" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">{lang === "vi" ? "Tong truy van" : "Total queries"}</div>
          <div className="kpi-val">{allWf.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cache hit rate</div>
          <div className="kpi-val">{cacheRate}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{lang === "vi" ? "Toc do sinh TB" : "Avg tok/s"}</div>
          <div className="kpi-val">{avgTokPs}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{lang === "vi" ? "Latency TB" : "Avg latency"}</div>
          <div className="kpi-val">{avgLat}s</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 14 }}>
        {filterTabs.map((f) => (
          <button key={f.key}
                  className={"filter-btn" + (pathFilter === f.key ? " active" : "")}
                  onClick={() => setPathFilter(f.key)}>
            {f.label}
            <span className="count tnum">{
              f.key === "all" ? allWf.length : allWf.filter((r) => r.path === f.key).length
            }</span>
          </button>
        ))}
      </div>

      <div className={"table-wrap" + (selected ? " has-drawer" : "")}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.col_time}</th>
              <th>{t.col_user}</th>
              <th>{t.col_question}</th>
              <th>{t.col_path}</th>
              <th style={{ textAlign: "right" }}>{t.col_lat_ms}</th>
              <th style={{ textAlign: "right" }}>{t.col_tokens} (in/out)</th>
              <th style={{ textAlign: "right" }}>{t.col_tokps}</th>
              <th>{t.col_conf}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}
                  className={"trow" + (selected && selected.id === r.id ? " active" : "")}
                  onClick={() => setSelected(selected && selected.id === r.id ? null : r)}>
                <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                  {formatTime(r.timestamp, lang)}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  {r.user.split(".")[1] || r.user}
                </td>
                <td className="q-cell" style={{ maxWidth: 220 }}>
                  <span className="q-text">{r.question}</span>
                </td>
                <td><PathPill path={r.path} t={t}/></td>
                <td style={{ textAlign: "right" }}>
                  <span className="tnum" style={{ fontSize: 12 }}>
                    {r.total_ms >= 1000 ? (r.total_ms / 1000).toFixed(2) + "s" : r.total_ms + "ms"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.tokens_in > 0
                    ? <span className="tnum" style={{ fontSize: 11.5 }}>
                        {r.tokens_in}<span style={{ color: "var(--text-muted)" }}>/</span>{r.tokens_out}
                      </span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>--</span>
                  }
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.tok_per_sec != null
                    ? <span className="tnum" style={{
                        fontSize: 12,
                        color: r.tok_per_sec >= 50 ? "var(--green-500)" : "var(--text)"
                      }}>{r.tok_per_sec}</span>
                    : <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>--</span>
                  }
                </td>
                <td>
                  {r.path === "fallback"
                    ? <span className="pill bad"><span className="dot"/>Fallback</span>
                    : <ConfBar value={r.confidence}/>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {selected && (
          <div className="drawer">
            <div className="drawer-hd">
              <span>{t.wf_drawer_title}</span>
              <button className="close-btn" onClick={() => setSelected(null)}>
                <Icon name="close" size={14}/>
              </button>
            </div>
            <div className="drawer-body">
              <div className="d-section">
                <div className="d-label">{t.col_question}</div>
                <div className="d-val">{selected.question}</div>
              </div>
              <div className="d-section">
                <div className="d-label">{t.col_path}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                  <PathPill path={selected.path} t={t}/>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-soft)" }}>
                    {selected.total_ms >= 1000
                      ? (selected.total_ms / 1000).toFixed(2) + "s"
                      : selected.total_ms + "ms"} total
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-soft)" }}>
                    {relTime(selected.timestamp, lang)}
                  </span>
                </div>
              </div>
              {selected.tokens_in > 0 && (
                <div className="d-section">
                  <div className="d-label">Tokens</div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.wf_in}</div>
                      <div className="tnum" style={{ fontSize: 16, fontWeight: 600 }}>{selected.tokens_in}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.wf_out}</div>
                      <div className="tnum" style={{ fontSize: 16, fontWeight: 600 }}>{selected.tokens_out}</div>
                    </div>
                    {selected.tok_per_sec != null && (
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tok/s</div>
                        <div className="tnum" style={{
                          fontSize: 16, fontWeight: 600,
                          color: selected.tok_per_sec >= 50 ? "var(--green-500)" : "var(--text)"
                        }}>
                          {selected.tok_per_sec}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selected.path === "cache_hit" && (
                <div className="d-section">
                  <div className="d-val" style={{ color: "var(--green-500)", fontSize: 12 }}>
                    {t.wf_cache_hit}
                  </div>
                </div>
              )}
              <div className="d-section">
                <div className="d-label">{t.wf_stage_breakdown}</div>
                <StageBar stages={selected.stages} totalMs={selected.total_ms} t={t}/>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export to window
Object.assign(window, {
  OverviewPage, LogsPage, FailingPage, EvalPage, SystemPage, WorkflowPage,
});
