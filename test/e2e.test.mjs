// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * QiBid Lite 端到端自验证套件（零外部依赖，运行：node --test test/e2e.test.mjs）。
 * 覆盖：
 *  1. CLI --help / sources
 *  2. scan 示例招标文件 + HTML 一页纸决策单（事实、100 分评分表、废标红线、日程、群汇报摘要）
 *  3. 真实 .docx（纯标准 ZIP + word/document.xml 含 6 列评分表）解析与 100 分核验
 *  4. 扫描版 PDF 自动探测与离线 OCR 升级提示（严禁静默吐空报告）
 *  5. URL SSRF 防护（拒绝 127.0.0.1 与云元数据 169.254.169.254）
 *  6. batch 批量体检输出对比 HTML 与 Excel UTF-8 BOM CSV
 *  7. export-pack 输出与启标桌面版兼容的 qibid-pack.json + 看标/ 目录
 *  8. MCP Server (--mcp) 完整 stdio JSON-RPC 2.0 协议（initialize / 7 工具 / 3 Prompts）
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "qibid-lite.mjs");
const TMP = mkdtempSync(join(tmpdir(), "qibid-lite-e2e-"));

after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function runCli(args) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 20_000,
  });
}

/** 构造最小合规 .docx（STORE/DEFLATE ZIP，内含 word/document.xml），零外部依赖。 */
function buildMinimalDocx(documentXml) {
  const nameBuf = Buffer.from("word/document.xml", "utf8");
  const rawBuf = Buffer.from(documentXml, "utf8");
  const compBuf = deflateRawSync(rawBuf);

  // CRC-32
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of rawBuf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // DEFLATE
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compBuf.length, 18);
  local.writeUInt32LE(rawBuf.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const cdOffset = local.length + compBuf.length;
  const cd = Buffer.alloc(46 + nameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(compBuf.length, 20);
  cd.writeUInt32LE(rawBuf.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);
  nameBuf.copy(cd, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([local, compBuf, cd, eocd]);
}

describe("QiBid Lite 端到端验证（CLI / DOCX / PDF / SSRF / Batch / Pack / MCP）", () => {
  it("1. CLI --help 与 sources 正常工作", () => {
    const help = runCli(["--help"]);
    assert.match(help, /QiBid Lite/);
    assert.match(help, /export-pack/);
    const sources = JSON.parse(runCli(["sources"]));
    assert.equal(sources.demoCount, 12);
    assert.equal(sources.sources.length, 12);
  });

  it("2. scan 内置脱敏服务标：准确抽出核心事实、7 项 100 分评分表、废标红线与可分享 HTML", () => {
    const htmlPath = join(TMP, "service-report.html");
    const out = JSON.parse(runCli(["scan", "examples/sample-service-tender.md", "--html", htmlPath]));
    assert.equal(out.projectName, "示例市智慧政务数据治理与运维服务项目");
    assert.equal(out.projectNo, "DEMO-2026-FW001");
    assert.equal(out.budgetWan, 380);
    assert.equal(out.deadline, "2026-11-26T09:30");
    assert.equal(out.scoringCount, 7);
    const totalScore = out.scoring.reduce((sum, item) => sum + Number(item.maxScore ?? 0), 0);
    assert.equal(totalScore, 100);
    assert.ok(out.disqualifyCount >= 10, `期望命中 >=10 条废标红线，实际 ${out.disqualifyCount}`);
    assert.ok(out.keyDatesCount >= 4, `期望抽出 >=4 个关键日程，实际 ${out.keyDatesCount}`);
    assert.match(out.groupSummary, /示例市智慧政务数据治理与运维服务项目/);

    assert.ok(existsSync(htmlPath));
    const html = readFileSync(htmlPath, "utf8");
    assert.match(html, /合计 100 分/);
    assert.match(html, /copy-summary/);
    assert.match(html, /qibid\.lingqiai\.online\/download/);
  });

  it("3. 真实 .docx 解析：含 6 列属性表（是否暗标/是否客观分）准确抽出 100 分评分表", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>示例省政务云平台升级改造项目公开招标文件</w:t></w:r></w:p>
    <w:p><w:r><w:t>项目编号：TEST-DOCX-2026-01</w:t></w:r></w:p>
    <w:p><w:r><w:t>项目名称：示例省政务云平台升级改造项目</w:t></w:r></w:p>
    <w:p><w:r><w:t>预算金额：260万元，最高限价：250万元，超出最高限价作废标处理。</w:t></w:r></w:p>
    <w:p><w:r><w:t>投标截止时间：2026年12月20日 09:30（北京时间）。本项目不接受联合体投标。</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>序号</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>评审因素</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>评分标准说明</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>分值</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>是否暗标</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>是否客观分</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>投标报价</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>基准价得满分20分</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>20</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>否</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>是</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>类似业绩</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>近三年同类合同每份5分最高30分</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>否</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>是</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>云平台实施方案</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>至少包含迁移计划、容灾设计、等保合规与运维培训</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>50</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>是</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>否</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body>
</w:document>`;
    const docxPath = join(TMP, "sample-tender.docx");
    writeFileSync(docxPath, buildMinimalDocx(xml));

    const out = JSON.parse(runCli(["scan", docxPath]));
    assert.equal(out.meta.kind, "docx");
    assert.equal(out.meta.scanDetected, false);
    assert.equal(out.projectName, "示例省政务云平台升级改造项目");
    assert.equal(out.projectNo, "TEST-DOCX-2026-01");
    assert.equal(out.budgetWan, 260);
    assert.equal(out.scoringCount, 3);
    assert.equal(out.scoring.reduce((s, x) => s + x.maxScore, 0), 100);
    assert.equal(out.scoring[0].item, "投标报价");
    assert.equal(out.scoring[0].objective, true);
    assert.equal(out.scoring[2].item, "云平台实施方案");
    assert.equal(out.scoring[2].objective, false);
  });

  it("4. 扫描版 PDF 自动探测：诚实标记 scanDetected=true 并给出离线 OCR 提示，不吐「正文」空报告", () => {
    const scanPdf = join(TMP, "scanned-tender.pdf");
    writeFileSync(
      scanPdf,
      "%PDF-1.4\n1 0 obj << /Type /Page /Resources << /XObject << /Im0 2 0 R >> >> >> endobj\n2 0 obj << /Type /XObject /Subtype /Image /Width 1654 /Height 2339 >> stream\n0000\nendstream endobj\n%%EOF\n",
      "latin1",
    );
    const out = JSON.parse(runCli(["scan", scanPdf]));
    assert.equal(out.meta.kind, "pdf-scan");
    assert.equal(out.meta.scanDetected, true);
    assert.equal(out.meta.pageCount, 1);
    assert.notEqual(out.projectName, "正文");
    assert.match(out.meta.upgradeReason ?? "", /离线 OCR/);
  });

  it("5. URL SSRF 防护：严格拒绝内网与云元数据地址", () => {
    for (const badUrl of ["http://127.0.0.1:8080/admin", "http://169.254.169.254/latest/meta-data/", "http://localhost:3000/"]) {
      const r = spawnSync(process.execPath, [BIN, "scan", badUrl], { cwd: ROOT, encoding: "utf8" });
      assert.notEqual(r.status, 0, `SSRF URL 不应被放行：${badUrl}`);
      assert.match(r.stderr, /拒绝访问内网或本机地址/);
    }
  });

  it("6. batch 批量体检：输出横向对比 HTML 与带 UTF-8 BOM 的 Excel CSV", () => {
    const htmlPath = join(TMP, "batch.html");
    const csvPath = join(TMP, "batch.csv");
    const out = JSON.parse(runCli(["batch", "examples", "--html", htmlPath, "--csv", csvPath]));
    assert.equal(out.count, 2);
    assert.ok(existsSync(htmlPath));
    assert.ok(existsSync(csvPath));
    const csvBytes = readFileSync(csvPath);
    assert.equal(csvBytes[0], 0xef);
    assert.equal(csvBytes[1], 0xbb);
    assert.equal(csvBytes[2], 0xbf);
    assert.match(csvBytes.toString("utf8"), /DEMO-2026-FW001/);
    assert.match(csvBytes.toString("utf8"), /DEMO-2026-HW002/);
  });

  it("7. export-pack：生成与启标桌面完整版同构的 qibid-pack.json + 看标/ 目录", () => {
    const packDir = join(TMP, "handoff-pack");
    const out = JSON.parse(runCli(["export-pack", "examples/sample-service-tender.md", "--out", packDir]));
    assert.equal(out.ok, true);
    for (const rel of ["qibid-pack.json", "看标/facts.json", "看标/scoring.json", "看标/reading.md", "看标/废标红线体检.html"]) {
      assert.ok(existsSync(join(packDir, ...rel.split("/"))), `缺少产物：${rel}`);
    }
    const meta = JSON.parse(readFileSync(join(packDir, "qibid-pack.json"), "utf8"));
    assert.equal(meta.schemaVersion, 1);
    assert.equal(meta.projectNo, "DEMO-2026-FW001");
  });

  it("8. MCP Server (--mcp)：完整 JSON-RPC 2.0 握手、7 个工具与 3 个 Prompts 端到端通过", () => {
    const mcpPackDir = join(TMP, "mcp-pack");
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "prompts/list", params: {} },
      { jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "tender-go-no-go", arguments: { target: "examples/sample-service-tender.md" } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "scan_tender", arguments: { filePath: "examples/sample-service-tender.md" } } },
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "check_disqualify", arguments: { filePath: "examples/sample-service-tender.md" } } },
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "extract_scoring", arguments: { filePath: "examples/sample-service-tender.md" } } },
      { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "extract_key_dates", arguments: { filePath: "examples/sample-service-tender.md" } } },
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "batch_scan_dir", arguments: { dirPath: "examples" } } },
      { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "export_qibid_pack", arguments: { filePath: "examples/sample-service-tender.md", outDir: mcpPackDir } } },
      { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "list_demo_sources", arguments: {} } },
    ];
    const r = spawnSync(process.execPath, [BIN, "--mcp"], {
      cwd: ROOT,
      input: `${requests.map((x) => JSON.stringify(x)).join("\n")}\n`,
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(r.status, 0, r.stderr);
    const responses = r.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(responses.length, requests.length);

    const byId = new Map(responses.map((res) => [res.id, res]));
    assert.equal(byId.get(1).result.serverInfo.name, "qibid-lite");
    assert.equal(byId.get(2).result.tools.length, 7);
    assert.equal(byId.get(3).result.prompts.length, 3);
    assert.match(byId.get(4).result.messages[0].content.text, /scan_tender/);

    const scanData = JSON.parse(byId.get(5).result.content[0].text);
    assert.equal(scanData.facts.projectNo, "DEMO-2026-FW001");
    assert.equal(scanData.scoringCount, 7);

    const dqData = JSON.parse(byId.get(6).result.content[0].text);
    assert.ok(dqData.hits.length >= 10);

    const scoringData = JSON.parse(byId.get(7).result.content[0].text);
    assert.equal(scoringData.items.length, 7);

    const datesData = JSON.parse(byId.get(8).result.content[0].text);
    assert.ok(datesData.length >= 4);

    const batchData = JSON.parse(byId.get(9).result.content[0].text);
    assert.equal(batchData.count, 2);

    const packData = JSON.parse(byId.get(10).result.content[0].text);
    assert.equal(packData.ok, true);
    assert.ok(existsSync(join(mcpPackDir, "qibid-pack.json")));

    const srcData = JSON.parse(byId.get(11).result.content[0].text);
    assert.equal(srcData.demoCount, 12);
  });
});
