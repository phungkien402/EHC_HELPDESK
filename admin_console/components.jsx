// Reusable UI primitives for EHC Helpdesk Admin

const { useState, useMemo, useEffect, useRef } = React;

// ---------- i18n ----------
const I18N = {
  vi: {
    nav_overview: "Tổng quan",
    nav_logs: "Logs truy vấn",
    nav_failing: "Câu hỏi fail",
    nav_eval: "Đánh giá",
    nav_system: "Hệ thống",
    nav_monitor: "Giám sát",
    nav_ops: "Vận hành",

    breadcrumb_admin: "Admin",
    search_ph: "Tìm theo câu hỏi, user, session...",

    reindex: "Reindex",
    maintenance: "Bảo trì",
    refresh: "Tải lại",
    export: "Xuất CSV",
    run_eval: "Chạy eval",

    // Overview
    overview_title: "Tổng quan",
    overview_sub: "Trạng thái hệ thống và chỉ số 24h gần nhất",
    kpi_volume: "Truy vấn (24h)",
    kpi_fallback: "Tỷ lệ fallback",
    kpi_latency: "Độ trễ TB",
    kpi_users: "Người dùng",
    vs_yesterday: "so với hôm qua",
    conf_dist_title: "Phân bố confidence",
    conf_dist_sub: "Reranker score, 24h qua — kết quả thành công vs. fallback",
    volume_title: "Lưu lượng 28 ngày",
    volume_sub: "Số truy vấn mỗi ngày",
    top_failing_title: "Câu hỏi hay fail",
    top_failing_sub: "Confidence thấp hoặc fallback — cần bổ sung FAQ",
    view_all: "Xem tất cả",

    // Logs
    logs_title: "Logs truy vấn",
    logs_sub: "Lịch sử hỏi đáp gần nhất — bấm để xem chi tiết",
    f_all: "Tất cả",
    f_ok: "Thành công",
    f_fallback: "Fallback",
    f_slack: "Slack",
    f_web: "Web",
    col_time: "Thời gian",
    col_platform: "Nguồn",
    col_user: "User",
    col_question: "Câu hỏi",
    col_conf: "Confidence",
    col_lat: "Latency",
    col_status: "Status",

    // Drawer
    drawer_label: "Chi tiết truy vấn",
    d_original: "Câu hỏi gốc",
    d_rewritten: "Câu hỏi sau rewrite",
    d_answer: "Câu trả lời",
    d_chunks: "Chunks retrieved (top 3)",
    d_meta: "Metadata",
    d_user: "User",
    d_session: "Session",
    d_platform: "Platform",
    d_time: "Thời gian",
    d_lat: "Latency",
    d_conf: "Confidence (reranker)",
    d_outcome: "Kết quả",
    d_source: "FAQ nguồn",
    open_redmine: "Mở Redmine",
    debug_hidden: "Bật 'Show debug info' trong panel Tweaks để xem rewrite + chunks",

    // Failing
    failing_title: "Câu hỏi hay fail",
    failing_sub: "Confidence dưới 0.5 hoặc fallback — danh sách ưu tiên để bổ sung FAQ Redmine",
    col_count: "Lần hỏi",
    col_last: "Gần nhất",
    col_avg: "Conf TB",
    col_suggest: "Đề xuất",
    write_faq: "Viết FAQ",

    // Eval
    eval_title: "Đánh giá pipeline",
    eval_sub: "Bộ test 22 câu — chạy bằng `python -m tests.evaluate`",
    last_run: "Lần chạy cuối",
    eval_overall: "Tổng",
    eval_infaq: "In-FAQ",
    eval_colloquial: "Colloquial",
    eval_fallback: "Fallback",
    eval_ambig: "Ambiguous",
    eval_avg_lat: "Latency TB",
    eval_history: "Lịch sử 7 ngày qua",
    eval_pass_rate: "Pass rate",
    col_case: "Câu hỏi test",
    col_expected: "Kỳ vọng",
    col_actual: "Thực tế",
    col_category: "Loại",
    cat_in_faq: "In-FAQ",
    cat_colloquial: "Colloquial",
    cat_fallback: "Fallback",
    cat_ambiguous: "Ambiguous",
    pass: "PASS",
    fail: "FAIL",

    // System
    system_title: "Hệ thống",
    system_sub: "Trạng thái dịch vụ và thao tác vận hành",
    services: "Dịch vụ",
    operations: "Thao tác",
    op_reindex_title: "Reindex toàn bộ FAQ",
    op_reindex_desc: "Fetch lại 1392 entries từ Redmine, re-embed bằng bge-m3 và ghi vào Qdrant. Mất ~8 phút.",
    op_maint_title: "Chế độ bảo trì",
    op_maint_desc: "Trả response tĩnh cho mọi truy vấn — dùng khi đang reindex hoặc nâng cấp.",
    op_backup_title: "Backup Qdrant",
    op_backup_desc: "Snapshot collection ehc_faq ra file. Lưu trong /var/backups/qdrant/.",
    last_reindex: "Lần reindex cuối",
    healthy: "Healthy",
    uptime: "Uptime",
    port: "Cổng",
    model: "Model",
    device: "Device",
    vram: "VRAM",
    points: "Điểm",
    collection: "Collection",
    requests24h: "Requests 24h",

    fallback_label: "Fallback",
    ok_label: "OK",
    // Workflow log
    nav_workflow: "Workflow log",
    wf_title: "Workflow log",
    wf_sub: "Chi tiet thuc thi pipeline cho tung truy van -- latency, token, toc do sinh",
    wf_all: "Tat ca",
    wf_cache: "Cache",
    wf_shortcut: "Shortcut",
    wf_full: "Full",
    wf_fallback: "Fallback",
    col_path: "Path",
    col_tokens: "Tokens",
    col_tokps: "Tok/s",
    col_lat_ms: "Latency",
    wf_cache_label: "Cache hit",
    wf_shortcut_label: "Shortcut",
    wf_full_label: "Full pipeline",
    wf_fallback_label: "Fallback",
    wf_stage_fast: "Fast retrieve",
    wf_stage_classify: "Classify",
    wf_stage_rewrite: "Rewrite",
    wf_stage_retrieve: "Retrieve",
    wf_stage_rerank: "Rerank",
    wf_stage_generate: "Generate",
    wf_no_llm: "Khong goi LLM",
    wf_cache_hit: "Ket qua tu cache -- khong can inference",
    wf_intent_blocked: "Intent guard -> fallback",
    wf_drawer_title: "Chi tiet pipeline",
    wf_stage_breakdown: "Phan tich giai doan",
    wf_total: "Tong",
    wf_in: "In",
    wf_out: "Out",
  },
  en: {
    nav_overview: "Overview",
    nav_logs: "Query logs",
    nav_failing: "Failing questions",
    nav_eval: "Evaluation",
    nav_system: "System",
    nav_monitor: "Monitor",
    nav_ops: "Operations",

    breadcrumb_admin: "Admin",
    search_ph: "Search by question, user, session...",

    reindex: "Reindex",
    maintenance: "Maintenance",
    refresh: "Refresh",
    export: "Export CSV",
    run_eval: "Run eval",

    overview_title: "Overview",
    overview_sub: "System status and last 24h metrics",
    kpi_volume: "Queries (24h)",
    kpi_fallback: "Fallback rate",
    kpi_latency: "Avg latency",
    kpi_users: "Active users",
    vs_yesterday: "vs yesterday",
    conf_dist_title: "Confidence distribution",
    conf_dist_sub: "Reranker score, last 24h — answered vs fallback",
    volume_title: "28-day volume",
    volume_sub: "Queries per day",
    top_failing_title: "Top failing questions",
    top_failing_sub: "Low confidence or fallback — candidates for new FAQ entries",
    view_all: "View all",

    logs_title: "Query logs",
    logs_sub: "Recent Q&A history — click a row to inspect",
    f_all: "All",
    f_ok: "Answered",
    f_fallback: "Fallback",
    f_slack: "Slack",
    f_web: "Web",
    col_time: "Time",
    col_platform: "Source",
    col_user: "User",
    col_question: "Question",
    col_conf: "Confidence",
    col_lat: "Latency",
    col_status: "Status",

    drawer_label: "Query detail",
    d_original: "Original question",
    d_rewritten: "Rewritten query",
    d_answer: "Answer",
    d_chunks: "Retrieved chunks (top 3)",
    d_meta: "Metadata",
    d_user: "User",
    d_session: "Session",
    d_platform: "Platform",
    d_time: "Time",
    d_lat: "Latency",
    d_conf: "Confidence (reranker)",
    d_outcome: "Outcome",
    d_source: "Source FAQ",
    open_redmine: "Open in Redmine",
    debug_hidden: "Enable 'Show debug info' in the Tweaks panel to see rewrite + chunks",

    failing_title: "Failing questions",
    failing_sub: "Confidence below 0.5 or fallback — priority list for new Redmine FAQ entries",
    col_count: "Hits",
    col_last: "Last seen",
    col_avg: "Avg conf",
    col_suggest: "Suggested action",
    write_faq: "Write FAQ",

    eval_title: "Pipeline evaluation",
    eval_sub: "22-question test set — run via `python -m tests.evaluate`",
    last_run: "Last run",
    eval_overall: "Overall",
    eval_infaq: "In-FAQ",
    eval_colloquial: "Colloquial",
    eval_fallback: "Fallback",
    eval_ambig: "Ambiguous",
    eval_avg_lat: "Avg latency",
    eval_history: "Last 7 days",
    eval_pass_rate: "Pass rate",
    col_case: "Test question",
    col_expected: "Expected",
    col_actual: "Actual",
    col_category: "Category",
    cat_in_faq: "In-FAQ",
    cat_colloquial: "Colloquial",
    cat_fallback: "Fallback",
    cat_ambiguous: "Ambiguous",
    pass: "PASS",
    fail: "FAIL",

    system_title: "System",
    system_sub: "Service status and operational controls",
    services: "Services",
    operations: "Operations",
    op_reindex_title: "Reindex all FAQs",
    op_reindex_desc: "Re-fetch 1392 entries from Redmine, re-embed with bge-m3, and write to Qdrant. Takes ~8 min.",
    op_maint_title: "Maintenance mode",
    op_maint_desc: "Return a static response to every query — use during reindex or upgrades.",
    op_backup_title: "Backup Qdrant",
    op_backup_desc: "Snapshot the ehc_faq collection. Stored under /var/backups/qdrant/.",
    last_reindex: "Last reindex",
    healthy: "Healthy",
    uptime: "Uptime",
    port: "Port",
    model: "Model",
    device: "Device",
    vram: "VRAM",
    points: "Points",
    collection: "Collection",
    requests24h: "Requests 24h",

    fallback_label: "Fallback",
    ok_label: "OK",
    // Workflow log
    nav_workflow: "Workflow log",
    wf_title: "Workflow log",
    wf_sub: "Per-query pipeline execution -- latency, tokens, generation speed",
    wf_all: "All",
    wf_cache: "Cache",
    wf_shortcut: "Shortcut",
    wf_full: "Full",
    wf_fallback: "Fallback",
    col_path: "Path",
    col_tokens: "Tokens",
    col_tokps: "Tok/s",
    col_lat_ms: "Latency",
    wf_cache_label: "Cache hit",
    wf_shortcut_label: "Shortcut",
    wf_full_label: "Full pipeline",
    wf_fallback_label: "Fallback",
    wf_stage_fast: "Fast retrieve",
    wf_stage_classify: "Classify",
    wf_stage_rewrite: "Rewrite",
    wf_stage_retrieve: "Retrieve",
    wf_stage_rerank: "Rerank",
    wf_stage_generate: "Generate",
    wf_no_llm: "No LLM call",
    wf_cache_hit: "Answer from cache -- no inference",
    wf_intent_blocked: "Intent guard -> fallback",
    wf_drawer_title: "Pipeline detail",
    wf_stage_breakdown: "Stage breakdown",
    wf_total: "Total",
    wf_in: "In",
    wf_out: "Out",
  },
};

// ---------- Icons (inline SVG, stroke 1.5px) ----------
function Icon({ name, size = 16 }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>;
    case "list":
      return <svg {...common}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="0.8" fill="currentColor"/><circle cx="4" cy="12" r="0.8" fill="currentColor"/><circle cx="4" cy="18" r="0.8" fill="currentColor"/></svg>;
    case "alert":
      return <svg {...common}><path d="M12 3 L21 19 H3 Z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>;
    case "check-circle":
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>;
    case "server":
      return <svg {...common}><rect x="3" y="4" width="18" height="7" rx="1.2"/><rect x="3" y="13" width="18" height="7" rx="1.2"/><line x1="7" y1="7.5" x2="7.01" y2="7.5"/><line x1="7" y1="16.5" x2="7.01" y2="16.5"/></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "close":
      return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case "external":
      return <svg {...common}><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>;
    case "refresh":
      return <svg {...common}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>;
    case "chevron-down":
      return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case "arrow-up":
      return <svg {...common}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>;
    case "arrow-down":
      return <svg {...common}><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>;
    case "bell":
      return <svg {...common}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "sparkles":
      return <svg {...common}><path d="M5 3v4M3 5h4M19 13v4M17 15h4"/><path d="m12 6 2.5 5L20 13l-5.5 2L12 20l-2.5-5L4 13l5.5-2z"/></svg>;
    case "play":
      return <svg {...common}><path d="M6 4v16l14-8z"/></svg>;
    case "pause":
      return <svg {...common}><rect x="6" y="4" width="4" height="16" rx="0.8"/><rect x="14" y="4" width="4" height="16" rx="0.8"/></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>;
    case "filter":
      return <svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>;
    case "code":
      return <svg {...common}><path d="m16 6 4 6-4 6"/><path d="m8 6-4 6 4 6"/><path d="m14 4-4 16"/></svg>;
    case "database":
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case "user":
      return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

// ---------- Sparkline (svg path) ----------
function Sparkline({ values, color = "var(--green-500)", width = 86, height = 28, fill = false }) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 3;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return [x, y];
  });
  const d = points.map((p, i) => (i === 0 ? `M${p[0].toFixed(1)},${p[1].toFixed(1)}` : `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)).join(" ");
  const area = fill ? `${d} L${width},${height} L0,${height} Z` : null;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <path d={area} fill={color} opacity="0.12"/>}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.2" fill={color}/>
    </svg>
  );
}

// ---------- Bar chart (vertical) ----------
function BarChart({ values, labels, color = "var(--green-500)", height = 140 }) {
  const max = Math.max(...values, 1);
  return (
    <svg viewBox={`0 0 ${values.length * 24} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {/* y-axis ticks */}
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const y = height - 22 - (height - 32) * t;
        return <line key={t} x1="0" y1={y} x2={values.length * 24} y2={y} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="0.6"/>;
      })}
      {values.map((v, i) => {
        const h = ((v / max) * (height - 32));
        const x = i * 24 + 3;
        const y = height - 22 - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width="18" height={h} rx="2" fill={color} opacity={i === values.length - 1 ? 1 : 0.7}/>
            {labels && i % 4 === 0 && (
              <text x={x + 9} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--text-soft)" fontFamily="var(--font-mono)">{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Confidence pill / bar ----------
function ConfBar({ value, fallback }) {
  if (fallback) {
    return (
      <span className="pill bad"><span className="dot"/>Fallback</span>
    );
  }
  const pct = Math.round(value * 100);
  const low = value < 0.5;
  return (
    <div className="conf-bar">
      <div className="track"><div className={"fill" + (low ? " low" : "")} style={{ width: pct + "%" }}/></div>
      <div className="num">{pct}%</div>
    </div>
  );
}

function StatusPill({ fallback, t }) {
  return fallback
    ? <span className="pill bad"><span className="dot"/>{t.fallback_label}</span>
    : <span className="pill ok"><span className="dot"/>{t.ok_label}</span>;
}

function PlatformPill({ platform }) {
  const cls = platform === "slack" ? "pill platform-slack" : "pill platform-web";
  return <span className={cls}>{platform}</span>;
}

// ---------- Format helpers ----------
function relTime(ts, lang) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (lang === "vi") {
    if (diff < 60) return `${diff}s trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
    return `${Math.floor(diff / 86400)}d trước`;
  } else {
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
}

function formatTime(ts, lang) {
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtPct(v, d = 1) { return (v * 100).toFixed(d) + "%"; }
function fmtNum(v) { return new Intl.NumberFormat("en-US").format(v); }

// Expose to other babel scripts
Object.assign(window, {
  I18N, Icon, Sparkline, BarChart, ConfBar, StatusPill, PlatformPill,
  relTime, formatTime, fmtPct, fmtNum,
});
