// Main App shell — sidebar nav, topbar, page router, connection banner, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showDebug": false
}/*EDITMODE-END*/;

const NAV = [
  { id: "overview", icon: "grid",  group: "monitor", labelKey: "nav_overview" },
  { id: "logs",     icon: "list",  group: "monitor", labelKey: "nav_logs" },
  { id: "failing",  icon: "alert", group: "monitor", labelKey: "nav_failing" },
  { id: "eval",     icon: "check-circle", group: "ops", labelKey: "nav_eval" },
  { id: "system",   icon: "server", group: "ops", labelKey: "nav_system" },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = useState(() => localStorage.getItem("ehcLang") || "vi");
  const [page, setPage] = useState(() => localStorage.getItem("ehcPage") || "overview");
  const [reindexState, setReindexState] = useState("idle");
  const [connState, setConnState] = useState({ checked: false, online: false });

  const t = I18N[lang];

  useEffect(() => { localStorage.setItem("ehcLang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("ehcPage", page); }, [page]);

  useEffect(() => {
    document.body.classList.toggle("no-debug", !tweaks.showDebug);
  }, [tweaks.showDebug]);

  useEffect(() => {
    window.ehcApi.probe().then((ok) => setConnState({ checked: true, online: ok }));
  }, []);

  const handleReindex = async () => {
    setReindexState("running");
    try { await window.ehcApi.reindex(); } catch {}
    setTimeout(() => setReindexState("done"), 1500);
    setTimeout(() => setReindexState("idle"), 5000);
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
          <NavItem key={n.id} item={n} t={t} active={page === n.id} onClick={() => setPage(n.id)}/>
        ))}

        <div className="nav-section-label">{t.nav_ops}</div>
        {opsItems.map((n) => (
          <NavItem key={n.id} item={n} t={t} active={page === n.id} onClick={() => setPage(n.id)}/>
        ))}

        <div className="sidebar-footer">
          <ConnectionBadge state={connState} lang={lang}/>
          <div className="row" style={{ opacity: 0.7 }}>
            <span className="mono" style={{ fontSize: 10.5 }}>
              {window.ehcApi.base ? new URL(window.ehcApi.base).host : "no-api"}
            </span>
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
          {/* Connection banner — shown only when running on mock */}
          {connState.checked && !connState.online && <MockBanner lang={lang}/>}

          {page === "overview" && (
            <OverviewPage t={t} lang={lang}
              onOpenLogs={() => setPage("logs")}
              onOpenFailing={() => setPage("failing")}
            />
          )}
          {page === "logs" && <LogsPage t={t} lang={lang} debug={tweaks.showDebug}/>}
          {page === "failing" && <FailingPage t={t} lang={lang}/>}
          {page === "eval" && <EvalPage t={t} lang={lang}/>}
          {page === "system" && (
            <SystemPage t={t} lang={lang}
              onReindex={handleReindex} reindexState={reindexState}/>
          )}
        </div>
      </main>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Debug"/>
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

function NavItem({ item, t, active, onClick }) {
  return (
    <div className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="ic"><Icon name={item.icon} size={15}/></span>
      <span>{t[item.labelKey]}</span>
    </div>
  );
}

function ConnectionBadge({ state, lang }) {
  if (!state.checked) {
    return <div className="row"><span className="dot" style={{ background: "var(--text-soft)" }}/><span>{lang === "vi" ? "Đang kết nối…" : "Connecting…"}</span></div>;
  }
  if (state.online) {
    return <div className="row"><span className="dot"/><span>{lang === "vi" ? "Đã kết nối API" : "Connected"}</span></div>;
  }
  return <div className="row"><span className="dot" style={{ background: "var(--warn)" }}/><span>{lang === "vi" ? "Dữ liệu mẫu (offline)" : "Mock data (offline)"}</span></div>;
}

function MockBanner({ lang }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("ehcMockBannerDismissed") === "1");
  if (dismissed) return null;
  const dismiss = () => { sessionStorage.setItem("ehcMockBannerDismissed", "1"); setDismissed(true); };
  return (
    <div style={{
      background: "oklch(0.96 0.06 80)",
      border: "1px solid oklch(0.85 0.10 80)",
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 18,
      fontSize: 12.5,
      color: "oklch(0.42 0.12 75)",
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <Icon name="alert" size={14}/>
      <div style={{ flex: 1 }}>
        <strong>
          {lang === "vi" ? "Không tìm thấy backend API." : "Backend API unreachable."}
        </strong>{" "}
        {lang === "vi"
          ? <>Đang hiển thị dữ liệu mẫu. Mở qua FastAPI tại <code style={{ background: "rgba(255,255,255,0.5)", padding: "1px 5px", borderRadius: 3 }}>http://your-server:8080/admin-ui/</code> hoặc thêm <code style={{ background: "rgba(255,255,255,0.5)", padding: "1px 5px", borderRadius: 3 }}>?api=http://host:8080</code> vào URL.</>
          : <>Showing mock data. Open via FastAPI at <code style={{ background: "rgba(255,255,255,0.5)", padding: "1px 5px", borderRadius: 3 }}>http://your-server:8080/admin-ui/</code> or append <code style={{ background: "rgba(255,255,255,0.5)", padding: "1px 5px", borderRadius: 3 }}>?api=http://host:8080</code> to the URL.</>
        }
      </div>
      <button className="btn sm ghost" onClick={dismiss}><Icon name="close" size={12}/></button>
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
