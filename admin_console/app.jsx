// Main App shell — sidebar nav, topbar, page router, tweaks panel

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showDebug": false
}/*EDITMODE-END*/;

const NAV = [
  { id: "overview",  icon: "grid",         group: "monitor", labelKey: "nav_overview" },
  { id: "logs",      icon: "list",          group: "monitor", labelKey: "nav_logs",     countKey: "logs" },
  { id: "failing",   icon: "alert",         group: "monitor", labelKey: "nav_failing",  countKey: "failing" },
  { id: "workflow",  icon: "code",          group: "monitor", labelKey: "nav_workflow", countKey: "workflow" },
  { id: "eval",      icon: "check-circle",  group: "ops",     labelKey: "nav_eval" },
  { id: "system",    icon: "server",        group: "ops",     labelKey: "nav_system" },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = useState("vi");
  const [page, setPage] = useState("overview");
  const [maintenance, setMaintenance] = useState(false);
  const [reindexState, setReindexState] = useState("idle");

  const data = window.MOCK_DATA;
  const t = I18N[lang];

  // Toggle body class for debug-only visibility
  useEffect(() => {
    document.body.classList.toggle("no-debug", !tweaks.showDebug);
  }, [tweaks.showDebug]);

  const handleReindex = () => {
    setReindexState("running");
    setTimeout(() => setReindexState("done"), 2200);
    setTimeout(() => setReindexState("idle"), 6000);
  };

  const counts = {
    logs: data.logs.length,
    failing: data.failing.length,
    workflow: data.workflow.length,
  };

  const currentNav = NAV.find((n) => n.id === page);
  const monitorItems = NAV.filter((n) => n.group === "monitor");
  const opsItems = NAV.filter((n) => n.group === "ops");

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">EH</div>
          <div>
            <div className="brand-name">EHC Helpdesk</div>
            <div className="brand-sub">{lang === "vi" ? "Admin" : "Admin Console"}</div>
          </div>
        </div>

        <div className="nav-section-label">{t.nav_monitor}</div>
        {monitorItems.map((n) => (
          <NavItem key={n.id} item={n} t={t} active={page === n.id} count={counts[n.countKey]} onClick={() => setPage(n.id)}/>
        ))}

        <div className="nav-section-label">{t.nav_ops}</div>
        {opsItems.map((n) => (
          <NavItem key={n.id} item={n} t={t} active={page === n.id} count={counts[n.countKey]} onClick={() => setPage(n.id)}/>
        ))}

        <div className="sidebar-footer">
          <div className="row">
            <span className="dot"/>
            <span>{lang === "vi" ? "Tất cả dịch vụ ổn" : "All services healthy"}</span>
          </div>
          <div className="row" style={{ opacity: 0.7 }}>
            <span className="mono" style={{ fontSize: 10.5 }}>v0.4.3 · gpu-01</span>
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="crumb">
          <span>{t.breadcrumb_admin}</span>
          <span className="sep">/</span>
          <span className="now">{t[currentNav.labelKey]}</span>
        </div>

        <div className="search">
          <span className="ic"><Icon name="search" size={14}/></span>
          <input type="text" placeholder={t.search_ph}/>
          <span className="kbd">⌘K</span>
        </div>

        <div className="topbar-actions">
          <div className="lang-toggle">
            <button className={lang === "vi" ? "active" : ""} onClick={() => setLang("vi")}>VI</button>
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="btn ghost" aria-label="Notifications"><Icon name="bell" size={15}/></button>
          {maintenance && <span className="pill warn"><span className="dot"/>{lang === "vi" ? "Bảo trì" : "Maintenance"}</span>}
          <button className="btn green" onClick={handleReindex} disabled={reindexState === "running"}>
            <Icon name="refresh" size={13}/>
            {reindexState === "running" ? (lang === "vi" ? "Đang chạy" : "Running") : t.reindex}
          </button>
          <div className="avatar" title="phungkien">PK</div>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="main-inner">
          {page === "overview" && (
            <OverviewPage t={t} lang={lang} data={data}
              onOpenLogs={() => setPage("logs")}
              onOpenFailing={() => setPage("failing")}
            />
          )}
          {page === "logs" && (
            <LogsPage t={t} lang={lang} data={data} debug={tweaks.showDebug}/>
          )}
          {page === "failing" && (
            <FailingPage t={t} lang={lang} data={data}/>
          )}
          {page === "workflow" && (
            <WorkflowPage t={t} lang={lang} data={data}/>
          )}
          {page === "eval" && (
            <EvalPage t={t} lang={lang} data={data}/>
          )}
          {page === "system" && (
            <SystemPage t={t} lang={lang} data={data}
              maintenance={maintenance} setMaintenance={setMaintenance}
              onReindex={handleReindex} reindexState={reindexState}/>
          )}
        </div>
      </main>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label={lang === "vi" ? "Debug" : "Debug"}/>
        <TweakToggle
          label={lang === "vi" ? "Hiện chi tiết debug" : "Show debug info"}
          value={tweaks.showDebug}
          onChange={(v) => setTweak("showDebug", v)}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 12px 8px", lineHeight: 1.5 }}>
          {lang === "vi"
            ? "Hiện câu hỏi rewrite và chunks retrieved trong panel chi tiết của Logs."
            : "Reveal the rewritten query and retrieved chunks in the Logs detail drawer."}
        </div>
      </TweaksPanel>
    </div>
  );
}

function NavItem({ item, t, active, count, onClick }) {
  return (
    <div className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="ic"><Icon name={item.icon} size={15}/></span>
      <span>{t[item.labelKey]}</span>
      {count != null && <span className="count tnum">{count}</span>}
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
