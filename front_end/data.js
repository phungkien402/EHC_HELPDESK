// Mock data for EHC Helpdesk Admin Console

window.MOCK_DATA = (function () {
  // Deterministic pseudo-random for reproducible sparklines
  function seeded(seed) {
    let s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function buildSeries(seed, n, base, jitter) {
    const r = seeded(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(+(base + (r() - 0.5) * jitter).toFixed(2));
    }
    return out;
  }

  const now = Math.floor(Date.now() / 1000);

  const sampleQuestions = [
    {
      q: "Làm sao để in bảng kê khám bệnh trong EHC?",
      a: "Vào menu Báo cáo → Thống kê khám bệnh → chọn khoảng thời gian → bấm 'In bảng kê'. Hệ thống sẽ xuất file PDF có thể in trực tiếp.",
      rewritten: "Hướng dẫn in bảng kê khám bệnh trên phần mềm EHC",
      subj: "Hướng dẫn in bảng kê khám bệnh",
      url: "https://redmine.local/projects/ehcfaq/issues/142",
      conf: 0.94,
      fb: false,
      lat: 3.8,
    },
    {
      q: "EHC bị lỗi không lưu được hồ sơ bệnh án, làm sao?",
      a: "Kiểm tra: 1) Kết nối mạng đến server, 2) Quyền truy cập của user, 3) Trường bắt buộc đã điền đủ chưa. Nếu vẫn lỗi, gửi log từ Help → Export logs cho IT.",
      rewritten: "Khắc phục lỗi không lưu được hồ sơ bệnh án trên EHC",
      subj: "Lỗi không lưu được bệnh án — checklist",
      url: "https://redmine.local/projects/ehcfaq/issues/89",
      conf: 0.88,
      fb: false,
      lat: 5.1,
    },
    {
      q: "in toa thuoc bi mat dong ke",
      a: "Mở Cài đặt máy in → kiểm tra khổ giấy A5 và lề dưới (≥10mm). Nếu vẫn mất, vào File → Mẫu in → 'Toa thuốc chuẩn' để reset template.",
      rewritten: "Đơn thuốc khi in bị mất dòng cuối kẻ ngang",
      subj: "Mẫu in toa thuốc — cài đặt khổ giấy",
      url: "https://redmine.local/projects/ehcfaq/issues/201",
      conf: 0.81,
      fb: false,
      lat: 4.4,
    },
    {
      q: "Cách thêm chẩn đoán ICD-10 vào bệnh án?",
      a: "Trong màn hình bệnh án → tab Chẩn đoán → nút 'Thêm ICD' → tìm bằng mã hoặc tên bệnh → chọn chẩn đoán chính / phụ → Lưu.",
      rewritten: "Thêm mã ICD-10 vào hồ sơ bệnh án EHC",
      subj: "Quản lý mã ICD-10 trong bệnh án",
      url: "https://redmine.local/projects/ehcfaq/issues/57",
      conf: 0.91,
      fb: false,
      lat: 3.2,
    },
    {
      q: "How do I reset EHC password?",
      a: "Liên hệ admin nội bộ qua Slack #ehc-support. Password được reset thủ công, không tự gửi qua email vì lý do bảo mật HIPAA nội bộ.",
      rewritten: "Hướng dẫn reset mật khẩu tài khoản EHC",
      subj: "Quy trình reset mật khẩu",
      url: "https://redmine.local/projects/ehcfaq/issues/12",
      conf: 0.76,
      fb: false,
      lat: 4.0,
    },
    {
      q: "Thời tiết hôm nay thế nào?",
      a: "Xin lỗi, tôi chỉ hỗ trợ các câu hỏi liên quan đến phần mềm EHC. Bạn có câu hỏi nào về phần mềm bệnh án không?",
      rewritten: "(off-topic — intent guard)",
      subj: "(không có chunk phù hợp)",
      url: null,
      conf: 0.12,
      fb: true,
      lat: 1.1,
    },
    {
      q: "Xuat bao cao thu chi theo khoa nhu nao",
      a: "Báo cáo → Tài chính → 'Thu chi theo khoa' → chọn khoa và khoảng thời gian → Xuất Excel hoặc PDF. Cần quyền Trưởng khoa hoặc Kế toán.",
      rewritten: "Hướng dẫn xuất báo cáo thu chi tài chính theo khoa",
      subj: "Báo cáo thu chi theo khoa",
      url: "https://redmine.local/projects/ehcfaq/issues/178",
      conf: 0.69,
      fb: false,
      lat: 5.6,
    },
    {
      q: "Lỗi mã 5023 khi đồng bộ dữ liệu BHYT",
      a: "Mã 5023 = sai thông tin thẻ BHYT. Kiểm tra: số thẻ, ngày hiệu lực, nơi đăng ký KCB ban đầu. Đối chiếu với cổng BHYT trước khi gửi lại.",
      rewritten: "Xử lý lỗi 5023 khi đồng bộ dữ liệu Bảo hiểm Y tế",
      subj: "Mã lỗi đồng bộ BHYT — bảng tra cứu",
      url: "https://redmine.local/projects/ehcfaq/issues/244",
      conf: 0.86,
      fb: false,
      lat: 4.9,
    },
    {
      q: "ai la ceo cua microsoft",
      a: "Xin lỗi, tôi chỉ hỗ trợ các câu hỏi liên quan đến phần mềm EHC.",
      rewritten: "(off-topic — intent guard)",
      subj: "(không có chunk phù hợp)",
      url: null,
      conf: 0.08,
      fb: true,
      lat: 0.9,
    },
    {
      q: "Cài đặt máy in nhãn cho khoa Dược như thế nào?",
      a: "Yêu cầu IT thiết lập driver máy in nhãn (Zebra/TSC). Sau đó vào EHC → Cấu hình → Máy in → 'Nhãn dược' → chọn driver vừa cài → test in.",
      rewritten: "Cấu hình máy in nhãn dược trong EHC",
      subj: "Hướng dẫn cài máy in nhãn",
      url: "https://redmine.local/projects/ehcfaq/issues/156",
      conf: 0.83,
      fb: false,
      lat: 4.3,
    },
    {
      q: "Bệnh án điện tử có chữ ký số được không?",
      a: "Có. Cấu hình USB Token → EHC → Cài đặt → Chữ ký số → 'Bật eSign'. Mỗi bệnh án ký số sẽ được lưu hash SHA-256 và timestamp.",
      rewritten: "Cấu hình chữ ký số cho bệnh án điện tử",
      subj: "Chữ ký số trên bệnh án điện tử",
      url: "https://redmine.local/projects/ehcfaq/issues/93",
      conf: 0.79,
      fb: false,
      lat: 4.7,
    },
    {
      q: "in lai phieu thu lan thu 2",
      a: "Vào Tài chính → Lịch sử thu tiền → tìm phiếu → nút 'In lại' (yêu cầu quyền). Phiếu in lại sẽ có watermark 'BẢN SAO'.",
      rewritten: "In lại phiếu thu tiền lần 2",
      subj: "In lại phiếu thu — quy trình",
      url: "https://redmine.local/projects/ehcfaq/issues/118",
      conf: 0.72,
      fb: false,
      lat: 3.9,
    },
  ];

  const users = [
    "bs.nguyenvana", "bs.lethibinh", "bs.tranquochuy", "ktv.phamthimai",
    "duoc.hoanglong", "dd.vungochanh", "admin.ehc", "bs.dangthuydung"
  ];

  // Build a longer logs list
  const logs = [];
  for (let i = 0; i < 47; i++) {
    const tmpl = sampleQuestions[i % sampleQuestions.length];
    const minutesAgo = i * 7 + Math.floor((i % 5) * 3);
    logs.push({
      id: 4821 - i,
      timestamp: now - minutesAgo * 60,
      platform: i % 4 === 0 ? "slack" : "web",
      user: users[i % users.length],
      session: "s_" + (1000 + ((i * 13) % 87)),
      question: tmpl.q,
      rewritten: tmpl.rewritten,
      answer: tmpl.a,
      top_chunk: tmpl.subj,
      source_url: tmpl.url,
      confidence: Math.max(0.05, Math.min(0.98, tmpl.conf + ((i % 7) - 3) * 0.015)),
      is_fallback: tmpl.fb || (i % 17 === 0 && !tmpl.fb),
      latency_s: +(tmpl.lat + ((i % 5) - 2) * 0.2).toFixed(2),
      chunks: [
        { score: 0.98, subject: tmpl.subj, snippet: "…đoạn văn được retrieve top-1 cho câu hỏi này — chứa câu trả lời cốt lõi và bối cảnh xung quanh để LLM grounding…" },
        { score: 0.74, subject: "FAQ liên quan #2", snippet: "…chunk thứ hai có chủ đề gần — vẫn được truyền vào prompt nhưng không phải nguồn chính…" },
        { score: 0.61, subject: "FAQ liên quan #3", snippet: "…chunk thứ ba, độ liên quan thấp hơn, đóng vai trò bổ sung…" },
      ],
    });
  }

  // Confidence distribution buckets (10 bins, 0.0-1.0)
  const confDist = [3, 5, 4, 8, 11, 14, 22, 38, 67, 92]; // skewed high — healthy
  const confDistFallback = [28, 14, 6, 3, 1, 0, 0, 0, 0, 0];

  // Top failing questions
  const failing = [
    { q: "lam sao de doi giuong benh nhan giua khoa", count: 9, lastSeen: "2 giờ trước", avgConf: 0.31, suggested: "Chưa có FAQ — đề xuất viết entry mới" },
    { q: "xuat danh sach benh nhan theo bao hiem", count: 7, lastSeen: "5 giờ trước", avgConf: 0.36, suggested: "Có chunk gần — cần bổ sung từ khoá BHYT" },
    { q: "loi mat ket noi sau khi update windows", count: 6, lastSeen: "1 ngày trước", avgConf: 0.28, suggested: "Tạo FAQ mới về tương thích Windows" },
    { q: "cai dat may quet ma vach loai mới", count: 5, lastSeen: "1 ngày trước", avgConf: 0.41, suggested: "FAQ cũ outdated — cần cập nhật model mới" },
    { q: "in hoa don vat tu y te theo lo", count: 4, lastSeen: "2 ngày trước", avgConf: 0.33, suggested: "Chưa có FAQ — đề xuất viết entry mới" },
    { q: "ket noi voi he thong LIS xet nghiem", count: 4, lastSeen: "2 ngày trước", avgConf: 0.45, suggested: "Chunk tồn tại nhưng score thấp — review" },
    { q: "xoa benh an da ky so nhung sai thong tin", count: 3, lastSeen: "3 ngày trước", avgConf: 0.39, suggested: "Liên quan compliance — cần SOP rõ" },
  ];

  // Eval set
  const evals = {
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
      { date: "05-27", pass: 1.0, lat: 4.6 },
      { date: "05-28", pass: 1.0, lat: 4.61 },
    ],
    cases: [
      { id: 1, category: "in-faq", q: "Làm sao in bảng kê khám bệnh?", expected: "ref: FAQ #142", actual: "ref: FAQ #142", status: "pass", lat: 3.8 },
      { id: 2, category: "in-faq", q: "Cách thêm chẩn đoán ICD-10?", expected: "ref: FAQ #57", actual: "ref: FAQ #57", status: "pass", lat: 3.2 },
      { id: 3, category: "in-faq", q: "Lỗi không lưu được bệnh án", expected: "ref: FAQ #89", actual: "ref: FAQ #89", status: "pass", lat: 5.1 },
      { id: 4, category: "colloquial", q: "in toa thuoc bi mat dong ke", expected: "ref: FAQ #201", actual: "ref: FAQ #201", status: "pass", lat: 4.4 },
      { id: 5, category: "colloquial", q: "xuat bao cao thu chi the nao", expected: "ref: FAQ #178", actual: "ref: FAQ #178", status: "pass", lat: 5.6 },
      { id: 6, category: "fallback", q: "Thời tiết hôm nay?", expected: "fallback", actual: "fallback", status: "pass", lat: 1.1 },
      { id: 7, category: "fallback", q: "Ai là CEO Microsoft?", expected: "fallback", actual: "fallback", status: "pass", lat: 0.9 },
      { id: 8, category: "ambiguous", q: "in lại được không?", expected: "clarify or FAQ #118", actual: "ref: FAQ #118", status: "pass", lat: 3.9 },
    ],
  };

  return {
    now,
    metrics: {
      totalToday: 264,
      totalYesterday: 241,
      fallbackRate: 0.083, // 8.3%
      fallbackRateY: 0.097,
      avgLatency: 4.42,
      avgLatencyY: 4.71,
      p95Latency: 7.1,
      p95LatencyY: 7.8,
      activeUsers: 38,
      activeUsersY: 34,
      sparkVolume: buildSeries(1, 28, 240, 80),
      sparkLatency: buildSeries(2, 28, 4.5, 1.4),
      sparkFallback: buildSeries(3, 28, 9, 4),
    },
    confDist,
    confDistFallback,
    logs,
    failing,
    evals,
    system: {
      vllm: { status: "healthy", uptime: "12d 4h", port: 8000, model: "Qwen2.5-7B-Instruct", vram: "13.2 / 16.0 GB" },
      qdrant: { status: "healthy", uptime: "47d 11h", collection: "ehc_faq", points: 1392, port: 6333 },
      embedder: { status: "healthy", model: "bge-m3", device: "CPU", lastEmbed: "47d 11h ago" },
      reranker: { status: "healthy", model: "bge-reranker-v2-m3", device: "CPU" },
      api: { status: "healthy", uptime: "2d 9h", port: 8080, requests24h: 264 },
      lastReindex: "2026-04-11 03:00:00",
      maintenanceMode: false,
    },
  };
})();
