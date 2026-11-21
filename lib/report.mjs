// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * QiBid Lite 可分享 HTML 一页纸投标决策单 & 批量标讯对比表（HTML / Excel UTF-8 BOM CSV）。
 * 严守合规红线：所有产品引导仅存在于内部决策阅读用的 HTML 报告中，绝不写入任何用户 .docx 投标文件。
 */

function escapeHtml(raw) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function calcDaysLeft(deadline) {
  if (!deadline) return null;
  const ts = Date.parse(deadline.length === 10 ? `${deadline}T09:00:00+08:00` : deadline);
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

function scoringSum(scoring) {
  const items = Array.isArray(scoring) ? scoring : [];
  let total = 0;
  let subjective = 0;
  for (const s of items) {
    const w = Number(s.weight ?? s.maxScore ?? 0);
    if (Number.isFinite(w) && w > 0) total += w;
    if (s.objective === false || s.part === "技术") subjective += 1;
  }
  return { total: Math.round(total * 10) / 10, count: items.length, subjective };
}

export function buildGroupSummaryText(filename, facts, scoring, disqualify, meta = {}) {
  const sc = scoringSum(scoring);
  const dqCount = Array.isArray(disqualify) ? disqualify.length : 0;
  const qualCount = Array.isArray(facts.qualifications) ? facts.qualifications.length : 0;
  const budget = facts.budgetWan != null ? `${facts.budgetWan} 万元` : facts.ceilingWan != null ? `限价 ${facts.ceilingWan} 万元` : "未写明";
  const deadline = facts.deadline || facts.openAt || "未写明";
  const days = calcDaysLeft(facts.deadline || facts.openAt);
  const daysLabel = days === null ? "" : days < 0 ? `（已过截止 ${Math.abs(days)} 天）` : `（距截止约 ${days} 天）`;
  const lines = [
    `【投标一页纸速览】${facts.projectName || filename}`,
    `- 编号/采购人：${facts.projectNo || "—"} ｜ ${facts.buyer || "—"}`,
    `- 预算/限价：${budget} ｜ 截止：${deadline}${daysLabel}`,
    `- 硬性风险：识别 ${qualCount} 项资格条件、${dqCount} 条废标红线、${sc.count} 项评分标准（合计 ${sc.total || "待核"} 分）`,
  ];
  if (meta.scanDetected) lines.push("- 提示：源文件为扫描版 PDF，建议导入启标桌面版离线 OCR 完整识别");
  if (meta.loginWall) lines.push("- 提示：目标网站需登录/验证码，建议使用启标桌面版内置浏览器人工登录后导入");
  lines.push("- 来源：QiBid Lite 本地确定性体检（0 幻觉）");
  return lines.join("\n");
}

export function renderDecisionHtml(filename, facts, scoring, keyDates, disqualify, meta = {}) {
  const items = Array.isArray(scoring) ? scoring : [];
  const findings = Array.isArray(disqualify) ? disqualify : [];
  const quals = Array.isArray(facts.qualifications) ? facts.qualifications : [];
  const dates = Array.isArray(keyDates) ? keyDates : [];
  const sc = scoringSum(items);
  const days = calcDaysLeft(facts.deadline || facts.openAt);
  const estManualHours = Math.max(4, Math.round(2 + quals.length * 0.4 + sc.subjective * 1.2 + findings.length * 0.3));
  const summaryText = buildGroupSummaryText(filename, facts, scoring, disqualify, meta);

  const deadlineStatus = days === null
    ? { cls: "badge-warn", text: "截标时间待核" }
    : days < 0
      ? { cls: "badge-danger", text: `已过截止 ${Math.abs(days)} 天` }
      : days <= 5
        ? { cls: "badge-danger", text: `紧急：剩余 ${days} 天` }
        : { cls: "badge-ok", text: `充裕：剩余 ${days} 天` };

  const dqStatus = findings.length >= 6
    ? { cls: "badge-danger", text: `高危红线 ${findings.length} 条` }
    : findings.length > 0
      ? { cls: "badge-warn", text: `废标红线 ${findings.length} 条` }
      : { cls: "badge-ok", text: "未触发高频红线" };

  const scoreStatus = sc.count === 0
    ? { cls: "badge-warn", text: "未含评分表（仅公告）" }
    : Math.abs(sc.total - 100) < 0.01
      ? { cls: "badge-ok", text: `评分表 ${sc.count} 项 · 合计 100 分` }
      : { cls: "badge-warn", text: `评分表 ${sc.count} 项 · 合计 ${sc.total} 分（需复核）` };

  const diagnosticBanner = meta.upgradeReason
    ? `<div class="alert-box">
        <strong>⚠️ 需要桌面版能力接力：</strong>${escapeHtml(meta.upgradeReason)}
        <div style="margin-top:8px;"><a class="btn-inline" href="https://qibid.lingqiai.online/download/?from=lite-blocker" target="_blank" rel="noopener">下载启标桌面版（14 天全功能免费试用）→</a></div>
      </div>`
    : "";

  const qualHtml = quals.length === 0
    ? "<p class='muted'>未抽到独立资格条款列表（可核对招标文件第二章）。</p>"
    : `<ul class="list">${quals.slice(0, 25).map((q) => `<li><span class="tag">${q.hard ? "硬门槛" : "一般"}</span> ${escapeHtml(q.text)}</li>`).join("")}</ul>`;

  const dqHtml = findings.length === 0
    ? "<p class='muted'>未命中确定性废标红线规则（仍请结合招标文件原文人工复核）。</p>"
    : `<ul class="list">${findings.slice(0, 30).map((f) => `<li><span class="tag tag-danger">${escapeHtml(f.ruleId || "红线")} · ${escapeHtml(f.area || "")}</span> <strong>${escapeHtml(f.title || "")}</strong>：${escapeHtml(f.fix || "")} <span class="muted">（${escapeHtml(f.law || "")}）</span></li>`).join("")}</ul>`;

  const scoreHtml = items.length === 0
    ? "<p class='muted'>未识别到结构化评分表（若当前输入仅为采购公告，导入完整招标文件 .docx 可自动解析全部评分项）。</p>"
    : `<table><thead><tr><th>类别</th><th>评分项</th><th>分值</th><th>性质</th><th>核心要点</th></tr></thead><tbody>${items.slice(0, 50).map((s) => `<tr><td>${escapeHtml(s.part || "—")}</td><td>${escapeHtml(s.item || s.name || "")}</td><td><strong>${escapeHtml(s.weight ?? s.maxScore ?? "—")}</strong></td><td>${s.objective === true ? "客观分" : s.objective === false ? "主观分" : "—"}</td><td>${escapeHtml((s.elements || []).slice(0, 4).join("、") || "—")}</td></tr>`).join("")}</tbody></table>`;

  const datesHtml = dates.length === 0
    ? "<p class='muted'>未识别到额外日程节点。</p>"
    : `<table><thead><tr><th>节点</th><th>时间/规则</th><th>硬约束</th><th>原文摘录</th></tr></thead><tbody>${dates.map((d) => `<tr><td>${escapeHtml(d.label || d.kind)}</td><td><strong>${escapeHtml(d.at || d.rule || "—")}</strong></td><td>${d.hard ? "必须满足" : "参考"}</td><td class="muted">${escapeHtml(d.quote || "")}</td></tr>`).join("")}</tbody></table>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>投标一页纸与废标体检单 — ${escapeHtml(facts.projectName || filename)}</title>
<style>
  :root { --ink:#101D46; --text:#1C2024; --muted:#5A6270; --bg:#F9F9F8; --card:#FFFFFF; --line:#E4E7EC; --ok:#0F766E; --warn:#B45309; --danger:#B91C1C; }
  * { box-sizing:border-box; }
  body { font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 980px; margin: 28px auto; padding: 0 18px 40px; color: var(--text); background: var(--bg); line-height: 1.65; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:16px; }
  h1 { margin:0 0 6px; font-size:24px; color:var(--ink); letter-spacing:-0.01em; }
  h2 { margin:0 0 12px; font-size:16px; color:var(--ink); border-left:3px solid var(--ink); padding-left:10px; }
  .sub { font-size:13px; color:var(--muted); margin:0; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  button { cursor:pointer; border:1px solid var(--line); background:#fff; color:var(--ink); padding:7px 12px; border-radius:6px; font-size:13px; font-weight:600; }
  button.primary { background:var(--ink); color:#fff; border-color:var(--ink); }
  .ribbon { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px,1fr)); gap:10px; margin:14px 0 18px; }
  .metric { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .metric .k { font-size:12px; color:var(--muted); }
  .metric .v { font-size:18px; font-weight:700; color:var(--ink); margin-top:2px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:600; margin-top:4px; }
  .badge-ok { background:#CCFBF1; color:var(--ok); }
  .badge-warn { background:#FEF3C7; color:var(--warn); }
  .badge-danger { background:#FEE2E2; color:var(--danger); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px 20px; margin:14px 0; }
  .alert-box { background:#FFFBEB; border:1px solid #F59E0B; border-radius:10px; padding:14px 18px; margin:14px 0; color:#78350F; font-size:14px; }
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:13.5px; }
  th, td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
  th { background:#F3F4F6; color:var(--ink); font-weight:600; white-space:nowrap; }
  .list { margin:0; padding-left:18px; font-size:14px; }
  .list li { margin:6px 0; }
  .tag { display:inline-block; padding:1px 6px; border-radius:4px; font-size:12px; background:#EEF2FF; color:var(--ink); font-weight:600; margin-right:6px; }
  .tag-danger { background:#FEE2E2; color:var(--danger); }
  .muted { color:var(--muted); font-size:13px; }
  .handoff { background:var(--ink); color:#F8FAFC; border-radius:12px; padding:20px 24px; margin-top:24px; }
  .handoff h3 { margin:0 0 8px; font-size:17px; color:#fff; }
  .handoff p { margin:6px 0; font-size:14px; color:#CBD5E1; }
  .handoff-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:10px; margin:14px 0; }
  .handoff-item { background:rgba(255,255,255,0.08); border-radius:8px; padding:10px 12px; font-size:13px; color:#E2E8F0; }
  .handoff-item strong { color:#fff; display:block; margin-bottom:2px; }
  .btn-cta { display:inline-block; background:#FFFFFF; color:var(--ink); text-decoration:none; padding:9px 16px; border-radius:7px; font-weight:700; font-size:14px; margin-top:8px; }
  .btn-inline { color:#92400E; font-weight:700; }
  @media print { .no-print { display:none !important; } body { background:#fff; margin:0; max-width:none; } .card { break-inside:avoid; } }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${escapeHtml(facts.projectName || "招标文件一页纸与废标体检单")}</h1>
      <p class="sub">源文件：<code>${escapeHtml(filename)}</code> · 由 <strong>QiBid Lite（启标青春版）</strong> 本地确定性引擎生成（0 Token · 0 幻觉）</p>
    </div>
    <div class="actions no-print">
      <button type="button" id="copy-summary">复制群汇报摘要</button>
      <button type="button" class="primary" onclick="window.print()">打印 / 导出 PDF</button>
    </div>
  </div>

  <div class="ribbon">
    <div class="metric">
      <div class="k">预算 / 最高限价</div>
      <div class="v">${escapeHtml(facts.budgetWan != null ? `${facts.budgetWan} 万` : facts.ceilingWan != null ? `${facts.ceilingWan} 万` : "待核")}</div>
      <span class="badge badge-ok">编号：${escapeHtml(facts.projectNo || "—")}</span>
    </div>
    <div class="metric">
      <div class="k">投标截止 / 开标</div>
      <div class="v" style="font-size:15px;">${escapeHtml(facts.deadline || facts.openAt || "待核")}</div>
      <span class="badge ${deadlineStatus.cls}">${escapeHtml(deadlineStatus.text)}</span>
    </div>
    <div class="metric">
      <div class="k">确定性废标红线</div>
      <div class="v">${findings.length} 条</div>
      <span class="badge ${dqStatus.cls}">${escapeHtml(dqStatus.text)}</span>
    </div>
    <div class="metric">
      <div class="k">评分标准核验</div>
      <div class="v">${sc.count} 项</div>
      <span class="badge ${scoreStatus.cls}">${escapeHtml(scoreStatus.text)}</span>
    </div>
  </div>

  ${diagnosticBanner}

  <div class="card">
    <h2>一、核心事实总览</h2>
    <table>
      <tr><th>采购人</th><td>${escapeHtml(facts.buyer || "—")}</td><th>代理机构</th><td>${escapeHtml(facts.agency || "—")}</td></tr>
      <tr><th>预算金额（万元）</th><td>${escapeHtml(facts.budgetWan ?? "—")}</td><th>最高限价（万元）</th><td>${escapeHtml(facts.ceilingWan ?? "—")}</td></tr>
      <tr><th>保证金（万元）</th><td>${escapeHtml(facts.depositWan ?? "—")}</td><th>服务/交货期</th><td>${escapeHtml(facts.serviceTerm || "—")}</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>二、废标红线体检（${findings.length} 条）</h2>
    ${dqHtml}
  </div>

  <div class="card">
    <h2>三、投标人资格要求（${quals.length} 项）</h2>
    ${qualHtml}
  </div>

  <div class="card">
    <h2>四、评分标准表（${items.length} 项）</h2>
    ${scoreHtml}
  </div>

  <div class="card">
    <h2>五、关键日程与质疑窗口（${dates.length} 项）</h2>
    ${datesHtml}
  </div>

  <div class="handoff no-print">
    <h3>决定要投这个标？下一步用启标桌面完整版 0 损耗接力写标与预审</h3>
    <p>本标书已识别 <strong>${quals.length} 项资格要求</strong>、<strong>${sc.count} 项评分标准（${sc.subjective} 项主观方案）</strong> 与 <strong>${findings.length} 条废标红线</strong>；纯手工整理资质、撰写应标方案并逐条核查废标与围串标约需 <strong>${estManualHours}+ 小时</strong>。</p>
    <div class="handoff-grid">
      <div class="handoff-item"><strong>1. 零编造企业资质/业绩库</strong>自动匹配贵司真实证书与合同业绩，查不到强制留「待填」，绝不编造假参数。</div>
      <div class="handoff-item"><strong>2. 21 类交标前 AI 预审 + 防围串标</strong>含模拟评委打分、DOCX 元数据深度洗白与跨标书图片查重，严守 87 号令合规底线。</div>
      <div class="handoff-item"><strong>3. 暗标排版 + 254+ 源站更正盯防</strong>内置 LibreOffice 实排自动回填目录页码，桌面置顶浮窗实时提醒更正公告。</div>
    </div>
    <p>执行 <code>qibid-lite export-pack</code> 即可把本次解析结果导出为标准 <code>看标/</code> 目录，导入桌面版无需重复看标（<strong>14 天全功能免费试用，文件全程留在你的电脑上，到期不锁标书</strong>）。</p>
    <a class="btn-cta" href="https://qibid.lingqiai.online/download/?from=lite-decision-report" target="_blank" rel="noopener">免费下载启标桌面完整版（Windows）→</a>
  </div>

  <script>
    const summary = ${JSON.stringify(summaryText)};
    document.getElementById("copy-summary")?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      try {
        await navigator.clipboard.writeText(summary);
        btn.textContent = "已复制群汇报摘要 ✓";
        setTimeout(() => { btn.textContent = "复制群汇报摘要"; }, 2200);
      } catch {
        window.prompt("复制以下摘要发送至微信/钉钉群：", summary);
      }
    });
  </script>
</body>
</html>\n`;
}

export function renderBatchCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["文件名", "类型", "项目名称", "项目编号", "采购人", "预算(万元)", "截止时间", "废标红线数", "评分项数", "状态提示"];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push([
      r.file,
      r.kind,
      r.projectName,
      r.projectNo,
      r.buyer,
      r.budgetWan ?? "",
      r.deadline ?? "",
      r.disqualifyCount,
      r.scoringCount,
      r.note || "正常",
    ].map(esc).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function renderBatchHtml(rows) {
  const trs = rows.map((r) => `<tr>
    <td><code>${escapeHtml(r.file)}</code></td>
    <td><strong>${escapeHtml(r.projectName || "—")}</strong><div class="muted">${escapeHtml(r.projectNo || "")}</div></td>
    <td>${escapeHtml(r.buyer || "—")}</td>
    <td>${escapeHtml(r.budgetWan != null ? `${r.budgetWan} 万` : "—")}</td>
    <td>${escapeHtml(r.deadline || "—")}</td>
    <td>${r.disqualifyCount}</td>
    <td>${r.scoringCount}</td>
    <td>${escapeHtml(r.note || "可确定性解析")}</td>
  </tr>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>批量标讯横向对比表 — QiBid Lite</title>
<style>
  body { font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 1120px; margin: 28px auto; padding: 0 18px; color: #1C2024; background: #F9F9F8; line-height: 1.55; }
  h1 { color: #101D46; font-size: 22px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #E4E7EC; font-size: 13.5px; }
  th, td { border: 1px solid #E4E7EC; padding: 9px 10px; text-align: left; vertical-align: top; }
  th { background: #F3F4F6; color: #101D46; }
  .muted { color: #5A6270; font-size: 12px; }
  .foot { margin-top: 18px; padding: 14px 18px; background: #101D46; color: #fff; border-radius: 8px; font-size: 14px; }
  .foot a { color: #93C5FD; font-weight: 700; }
</style>
</head>
<body>
  <h1>批量标讯横向对比表（共 ${rows.length} 份文件）</h1>
  <table>
    <thead><tr><th>源文件</th><th>项目名称 / 编号</th><th>采购人</th><th>预算</th><th>截标时间</th><th>废标红线</th><th>评分项</th><th>状态</th></tr></thead>
    <tbody>${trs}</tbody>
  </table>
  <div class="foot">
    筛出拟投标项目后，运行 <code>qibid-lite export-pack &lt;文件&gt; --out ./项目目录</code> 即可导入
    <a href="https://qibid.lingqiai.online/download/?from=lite-batch" target="_blank" rel="noopener">启标桌面完整版（14 天免费试用）</a>，直接对接企业资质库写标与 21 类预审。
  </div>
</body>
</html>\n`;
}
