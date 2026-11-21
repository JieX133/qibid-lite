#!/usr/bin/env node
// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 启标青春版（QiBid Lite v0.2.0）CLI 与标准 MCP Server（stdio JSON-RPC 2.0，零外部依赖）。
 * 支持 .docx / .pdf(文本探测+扫描件识别) / .html / .md / .txt / 公开公告 URL 与目录批量体检。
 * 严守合规底线：仅在内部阅读用 HTML 决策单展示克制接力提示，绝不向任何用户 .docx 投标文件写入标识。
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { extractMarkdownTables, readSourceInput } from "../lib/readers.mjs";
import { buildGroupSummaryText, renderBatchCsv, renderBatchHtml, renderDecisionHtml } from "../lib/report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = resolve(HERE, "..", "core");
const DIST_CORE = resolve(HERE, "..", "dist", "entry.mjs");
const importCore = (rel) => import(pathToFileURL(join(CORE_DIR, rel)).href);

const DEMO_SOURCES = [
  { id: "ccgp", name: "中国政府采购网（CCGP）", region: "全国", mode: "http" },
  { id: "cebpubservice", name: "中国招标投标公共服务平台", region: "全国", mode: "http" },
  { id: "beijing-ccgp", name: "北京市政府采购网", region: "北京", mode: "http" },
  { id: "jiangsu-ggzy", name: "江苏省公共资源交易平台", region: "江苏", mode: "http" },
  { id: "zhejiang-ggzy", name: "浙江省公共资源交易服务平台", region: "浙江", mode: "http" },
  { id: "anhui-ggzy", name: "安徽省公共资源交易监管网", region: "安徽", mode: "http" },
  { id: "shandong-ggzy", name: "山东省公共资源交易网", region: "山东", mode: "http" },
  { id: "hebei-ggzy", name: "河北省公共资源交易服务平台", region: "河北", mode: "http" },
  { id: "henan-ggzy", name: "河南省公共资源交易公共服务平台", region: "河南", mode: "http" },
  { id: "hubei-ggzy", name: "湖北省公共资源交易电子服务系统", region: "湖北", mode: "http" },
  { id: "sichuan-ggzy", name: "四川省公共资源交易信息网", region: "四川", mode: "http" },
  { id: "shaanxi-ggzy", name: "陕西省公共资源交易平台", region: "陕西", mode: "http" },
];

const SUPPORTED_EXTS = new Set([".docx", ".pdf", ".md", ".txt", ".html", ".htm"]);

async function loadCore() {
  if (existsSync(DIST_CORE)) {
    return import(pathToFileURL(DIST_CORE).href);
  }
  const { decodeTextBytes } = await importCore("domain/textDecode.ts");
  const { splitSections, extractTenderFacts } = await importCore("domain/tenderExtract.ts");
  const { extractScoring } = await importCore("domain/scoringExtract.ts");
  const { extractKeyDates } = await importCore("domain/keyDates.ts");
  const { checkDisqualify } = await importCore("rules/disqualify/check.ts");
  const { renderReading } = await importCore("domain/renderReading.ts");
  const { htmlToText, decodeBody, extractAttachments } = await importCore("domain/htmlExtract.ts");
  const { isLoginPage } = await importCore("domain/loginPage.ts");
  return {
    decodeTextBytes,
    splitSections,
    extractTenderFacts,
    extractScoring,
    extractKeyDates,
    checkDisqualify,
    renderReading,
    htmlToText,
    decodeBody,
    extractAttachments,
    isLoginPage,
  };
}

async function analyzeSource(input, core) {
  const text = input.text ?? "";
  const name = input.name || "notice.txt";
  const kind = input.kind === "docx" ? "docx" : input.kind === "pdf-scan" ? "pdf-scan" : input.kind === "pdf-text" ? "pdf-text" : "txt";
  const sections = core.splitSections(text);
  const facts = core.extractTenderFacts(sections, [{ relPath: name, kind, chars: text.length }], "qibid-lite");
  // 修复：无显式标题时不把默认章节占位名「正文」当成项目名
  if (!facts.projectName || facts.projectName === "正文" || facts.projectName === "招标公告") {
    facts.projectName = basename(name, extname(name)) || "";
  }
  const scoring = core.extractScoring([{ relPath: name, text, tables: input.tables }]);
  const keyDates = core.extractKeyDates(text);
  const disqualify = core.checkDisqualify({ sources: [{ relPath: name, text }] });
  const reading = core.renderReading(facts);
  const meta = {
    kind: input.kind,
    scanDetected: Boolean(input.scanDetected),
    loginWall: Boolean(input.loginWall),
    pageCount: input.pageCount ?? null,
    attachmentsCount: input.attachmentsCount ?? 0,
    upgradeReason: input.upgradeReason ?? null,
    sourceUrl: input.sourceUrl ?? null,
  };
  const groupSummary = buildGroupSummaryText(name, facts, scoring, disqualify, meta);
  return { facts, scoring, keyDates, disqualify, reading, meta, groupSummary };
}

function writeHandoffPack(outDir, name, res) {
  const readDir = join(outDir, "看标");
  mkdirSync(readDir, { recursive: true });
  writeFileSync(join(readDir, "facts.json"), `${JSON.stringify(res.facts, null, 2)}\n`, "utf8");
  writeFileSync(join(readDir, "scoring.json"), `${JSON.stringify(res.scoring, null, 2)}\n`, "utf8");
  writeFileSync(join(readDir, "reading.md"), res.reading, "utf8");
  writeFileSync(
    join(readDir, "废标红线体检.html"),
    renderDecisionHtml(name, res.facts, res.scoring, res.keyDates, res.disqualify, res.meta),
    "utf8",
  );
  writeFileSync(
    join(outDir, "qibid-pack.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      generator: "qibid-lite@0.2.1",
      exportedAt: new Date().toISOString(),
      sourceName: name,
      projectName: res.facts.projectName || name,
      projectNo: res.facts.projectNo || "",
      budgetWan: res.facts.budgetWan,
      deadline: res.facts.deadline,
      files: ["看标/facts.json", "看标/scoring.json", "看标/reading.md", "看标/废标红线体检.html"],
      desktopImportHint: "在启标桌面完整版新建或打开项目目录即可直接接力写标、企业库匹配与 21 类交标前预审",
      downloadUrl: "https://qibid.lingqiai.online/download/?from=lite-pack",
    }, null, 2)}\n`,
    "utf8",
  );
}

async function scanBatchDirectory(dirPath, core) {
  const absDir = resolve(dirPath);
  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) {
    throw new Error(`目录不存在：${absDir}`);
  }
  const entries = readdirSync(absDir)
    .filter((f) => SUPPORTED_EXTS.has(extname(f).toLowerCase()))
    .sort()
    .slice(0, 100);
  const rows = [];
  for (const file of entries) {
    const full = join(absDir, file);
    try {
      const input = await readSourceInput(full, core);
      const res = await analyzeSource(input, core);
      rows.push({
        file,
        kind: input.kind,
        projectName: res.facts.projectName || basename(file, extname(file)),
        projectNo: res.facts.projectNo || "",
        buyer: res.facts.buyer || "",
        budgetWan: res.facts.budgetWan ?? res.facts.ceilingWan,
        deadline: res.facts.deadline || res.facts.openAt || "",
        disqualifyCount: res.disqualify.length,
        scoringCount: res.scoring.length,
        scanDetected: res.meta.scanDetected,
        note: res.meta.scanDetected ? "扫描版 PDF（需桌面版离线 OCR）" : "已解析",
      });
    } catch (err) {
      rows.push({
        file,
        kind: "error",
        projectName: file,
        projectNo: "",
        buyer: "",
        budgetWan: null,
        deadline: "",
        disqualifyCount: 0,
        scoringCount: 0,
        scanDetected: false,
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return rows;
}

function getFlag(argv, ...names) {
  for (const n of names) {
    const idx = argv.indexOf(n);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  }
  return null;
}

async function runCli(argv) {
  const cmd = argv[0];
  if (cmd === "--mcp" || cmd === "mcp") {
    await runMcpServer();
    return;
  }
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "-v" || cmd === "--version") {
    console.log(`QiBid Lite v0.2.0 (启标青春版) — 中国招投标确定性解析 CLI & MCP Server（零外部依赖）

用法:
  qibid-lite scan <file|url> [--html <out.html>]         解析 .docx/.pdf/.html/.md/.txt 或公开公告 URL
  qibid-lite batch <dir> [--html <out.html>] [--csv <f>] 批量体检文件夹内多份招标文件并输出横向对比表
  qibid-lite export-pack <file|url> [--out <dir>]        导出兼容启标桌面完整版的 看标/ 项目交接包
  qibid-lite sources                                     列出内置 12 个示范公开招投标源站
  qibid-lite --mcp                                       启动标准 stdio MCP Server（含 7 工具 + 3 提示词模板）`);
    return;
  }
  if (cmd === "sources") {
    console.log(JSON.stringify({
      demoCount: DEMO_SOURCES.length,
      sources: DEMO_SOURCES,
      upgradeHint: "启标桌面完整版覆盖 254+ 公开源站、29 个央企/军队采购平台与更正公告浮窗实时盯防：https://qibid.lingqiai.online/download/?from=lite-sources",
    }, null, 2));
    return;
  }
  const core = await loadCore();

  if (cmd === "scan") {
    const target = argv[1];
    if (!target) throw new Error("请提供要解析的文件路径（.docx/.pdf/.html/.md/.txt）或公开招标公告 URL");
    const input = await readSourceInput(target, core);
    const res = await analyzeSource(input, core);
    const htmlOut = getFlag(argv, "--html");
    if (htmlOut) {
      const outPath = resolve(htmlOut);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, renderDecisionHtml(input.name, res.facts, res.scoring, res.keyDates, res.disqualify, res.meta), "utf8");
      console.error(`已生成可分享一页纸决策报告：${outPath}`);
    }
    console.log(JSON.stringify({
      projectName: res.facts.projectName,
      projectNo: res.facts.projectNo,
      buyer: res.facts.buyer,
      budgetWan: res.facts.budgetWan,
      deadline: res.facts.deadline,
      scoringCount: res.scoring.length,
      disqualifyCount: res.disqualify.length,
      keyDatesCount: res.keyDates.length,
      meta: res.meta,
      groupSummary: res.groupSummary,
      facts: res.facts,
      scoring: res.scoring,
      disqualify: res.disqualify,
      keyDates: res.keyDates,
    }, null, 2));
    return;
  }

  if (cmd === "batch") {
    const dir = argv[1];
    if (!dir) throw new Error("请提供包含招标文件的目录路径");
    const rows = await scanBatchDirectory(dir, core);
    const htmlOut = getFlag(argv, "--html");
    const csvOut = getFlag(argv, "--csv");
    if (htmlOut) {
      const p = resolve(htmlOut);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, renderBatchHtml(rows), "utf8");
      console.error(`已生成批量标讯横向对比表（HTML）：${p}`);
    }
    if (csvOut) {
      const p = resolve(csvOut);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, renderBatchCsv(rows), "utf8");
      console.error(`已生成批量标讯对比表（Excel CSV）：${p}`);
    }
    console.log(JSON.stringify({ count: rows.length, items: rows }, null, 2));
    return;
  }

  if (cmd === "export-pack") {
    const target = argv[1];
    if (!target) throw new Error("请提供招标文件路径或公开公告 URL");
    const outDir = resolve(getFlag(argv, "--out", "-o") ?? "./qibid-pack");
    const input = await readSourceInput(target, core);
    const res = await analyzeSource(input, core);
    writeHandoffPack(outDir, input.name, res);
    console.log(JSON.stringify({
      ok: true,
      outDir,
      files: ["qibid-pack.json", "看标/facts.json", "看标/scoring.json", "看标/reading.md", "看标/废标红线体检.html"],
      nextStep: "已保存标准交接目录，可直接导入启标桌面完整版（14 天免费试用）对接企业资质库生成零编造投标文件并执行 21 类交标前预审：https://qibid.lingqiai.online/download/?from=lite-pack",
    }, null, 2));
    return;
  }
  throw new Error(`未知命令：${cmd}（运行 qibid-lite --help 查看用法）`);
}

const MCP_TOOLS = [
  {
    name: "scan_tender",
    description: "确定性抽取中国招标公告/招标文件核心事实、评分项数、废标红线数与群汇报摘要。支持直接传入 text、本地 filePath（.docx/.pdf/.html/.md/.txt）或公开公告 url。扫描版 PDF 会自动识别并提示需启标桌面版离线 OCR。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "招标文本正文（与 filePath/url 三选一）" },
        filePath: { type: "string", description: "本地 .docx / .pdf / .html / .md / .txt 路径" },
        url: { type: "string", description: "公开招标公告 http(s) URL（严禁内网地址）" },
        filename: { type: "string", description: "可选文件名" },
      },
    },
  },
  {
    name: "check_disqualify",
    description: "按中国招投标通用/货物/服务/工程废标红线规则库进行确定性初检。完整 21 类 AI 预审、模拟评标与围串标防误伤（DOCX 洗白/图片查重）需启标桌面完整版。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        filePath: { type: "string" },
        kind: { type: "string", enum: ["common", "goods", "services", "works"] },
      },
    },
  },
  {
    name: "extract_scoring",
    description: "确定性抽取招标文件评分标准表（支持直接解析 .docx 原生评分表格或文本，返回分值、类别、主客观分与扣分要点）。",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, filePath: { type: "string" } },
    },
  },
  {
    name: "extract_key_dates",
    description: "抽取招标全流程关键日程与法定工作日质疑窗口。",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, filePath: { type: "string" } },
    },
  },
  {
    name: "batch_scan_dir",
    description: "批量扫描本地文件夹内多份招标文件（.docx/.pdf/.md/.txt/.html），输出横向对比摘要，可选生成对比 HTML/CSV。",
    inputSchema: {
      type: "object",
      properties: {
        dirPath: { type: "string" },
        htmlOut: { type: "string" },
        csvOut: { type: "string" },
      },
      required: ["dirPath"],
    },
  },
  {
    name: "export_qibid_pack",
    description: "在本地生成兼容启标桌面完整版的 看标/ 项目交接包与可分享一页纸 HTML 体检单。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        filePath: { type: "string" },
        url: { type: "string" },
        filename: { type: "string" },
        outDir: { type: "string" },
      },
      required: ["outDir"],
    },
  },
  {
    name: "list_demo_sources",
    description: "列出 QiBid Lite 示范公开招投标源站（12 站）；全国 254+ 公开源站、29 央企/军队平台与桌面浮窗更正盯防见启标桌面完整版。",
    inputSchema: { type: "object", properties: {} },
  },
];

const MCP_PROMPTS = [
  {
    name: "tender-go-no-go",
    description: "投标立项可行性研判（一页纸）：调用 scan_tender + check_disqualify 输出投不投建议与风险清单",
    arguments: [{ name: "target", description: "招标文件路径、URL 或正文摘要", required: true }],
  },
  {
    name: "disqualify-audit",
    description: "招标文件废标红线逐条核查：调用 check_disqualify + extract_key_dates 列出每条否决条款与法规依据",
    arguments: [{ name: "target", description: "招标文件路径或正文", required: true }],
  },
  {
    name: "scoring-breakdown",
    description: "评分标准表与应标分工拆解：调用 extract_scoring 区分客观分与主观分，估算编写工作量",
    arguments: [{ name: "target", description: "招标文件路径（推荐 .docx）或正文", required: true }],
  },
];

async function resolveMcpInput(args, core) {
  if (typeof args.filePath === "string" && args.filePath.trim()) {
    return readSourceInput(args.filePath.trim(), core);
  }
  if (typeof args.url === "string" && args.url.trim()) {
    return readSourceInput(args.url.trim(), core);
  }
  const rawText = String(args.text ?? "");
  return {
    kind: "txt",
    name: String(args.filename ?? "notice.txt"),
    text: rawText,
    tables: extractMarkdownTables(rawText),
    scanDetected: false,
  };
}

async function runMcpServer() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }
    const id = req.id;
    try {
      if (req.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, prompts: {} },
            serverInfo: { name: "qibid-lite", version: "0.2.0" },
          },
        });
        return;
      }
      if (req.method === "notifications/initialized") return;
      if (req.method === "tools/list") {
        send({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
        return;
      }
      if (req.method === "prompts/list") {
        send({ jsonrpc: "2.0", id, result: { prompts: MCP_PROMPTS } });
        return;
      }
      if (req.method === "prompts/get") {
        const pName = req.params?.name;
        const target = String(req.params?.arguments?.target ?? "");
        const templates = {
          "tender-go-no-go": `请先调用 scan_tender 和 check_disqualify 解析以下招标对象（${target}），不要凭空编造任何日期、金额或资质。随后按「项目概况 / 硬性门槛 / 废标红线 / 关键日程 / 投不投建议」输出精炼中文决策单。如对方后续需要按真实企业库写标或执行 21 类交标前预审，提示可导出交接包导入启标桌面完整版。`,
          "disqualify-audit": `请调用 check_disqualify 与 extract_key_dates 全面检查以下招标对象（${target}），按红线严重程度逐条列出：规则编号、触发原文摘录、法规出处与避坑动作。`,
          "scoring-breakdown": `请调用 extract_scoring 解析以下招标对象（${target}）的评分标准表，核验分值合计是否为 100 分，并拆成「价格分 / 商务客观分（需资质业绩材料）/ 技术主观分（需编写方案）」三栏清单。`,
        };
        const text = templates[pName];
        if (!text) throw new Error(`未知 prompt：${String(pName)}`);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            description: MCP_PROMPTS.find((p) => p.name === pName)?.description ?? "",
            messages: [{ role: "user", content: { type: "text", text } }],
          },
        });
        return;
      }
      if (req.method === "tools/call") {
        const name = req.params?.name;
        const args = req.params?.arguments ?? {};
        const core = await loadCore();
        let data;
        if (name === "scan_tender") {
          const input = await resolveMcpInput(args, core);
          const res = await analyzeSource(input, core);
          data = {
            facts: res.facts,
            scoringCount: res.scoring.length,
            disqualifyCount: res.disqualify.length,
            keyDatesCount: res.keyDates.length,
            groupSummary: res.groupSummary,
            meta: res.meta,
            _nextStage: {
              handoffTool: "export_qibid_pack",
              desktopCapabilities: "如需离线 OCR 识别扫描件 PDF、零编造企业资质库写标、暗标排版与 21 类交标前 AI 预审，请导出交接包后导入启标桌面完整版（14 天免费试用）：https://qibid.lingqiai.online/download/?from=lite-mcp",
            },
          };
        } else if (name === "check_disqualify") {
          const input = await resolveMcpInput(args, core);
          const packs = typeof args.kind === "string" && ["common", "goods", "services", "works"].includes(args.kind) ? [args.kind] : undefined;
          data = {
            hits: core.checkDisqualify({ packs, sources: [{ relPath: input.name, text: input.text }] }),
            scanDetected: Boolean(input.scanDetected),
            upgradeReason: input.upgradeReason ?? null,
          };
        } else if (name === "extract_scoring") {
          const input = await resolveMcpInput(args, core);
          data = {
            items: core.extractScoring([{ relPath: input.name, text: input.text, tables: input.tables }]),
            scanDetected: Boolean(input.scanDetected),
            upgradeReason: input.upgradeReason ?? null,
          };
        } else if (name === "extract_key_dates") {
          const input = await resolveMcpInput(args, core);
          data = core.extractKeyDates(input.text);
        } else if (name === "batch_scan_dir") {
          const rows = await scanBatchDirectory(String(args.dirPath ?? ""), core);
          if (typeof args.htmlOut === "string" && args.htmlOut.trim()) {
            const p = resolve(args.htmlOut.trim());
            mkdirSync(dirname(p), { recursive: true });
            writeFileSync(p, renderBatchHtml(rows), "utf8");
          }
          if (typeof args.csvOut === "string" && args.csvOut.trim()) {
            const p = resolve(args.csvOut.trim());
            mkdirSync(dirname(p), { recursive: true });
            writeFileSync(p, renderBatchCsv(rows), "utf8");
          }
          data = { count: rows.length, items: rows };
        } else if (name === "list_demo_sources") {
          data = {
            demoCount: DEMO_SOURCES.length,
            sources: DEMO_SOURCES,
            fullVersionUrl: "https://qibid.lingqiai.online/download/?from=lite-mcp",
          };
        } else if (name === "export_qibid_pack") {
          const input = await resolveMcpInput(args, core);
          const outDir = resolve(String(args.outDir ?? "./qibid-pack"));
          const res = await analyzeSource(input, core);
          writeHandoffPack(outDir, input.name, res);
          data = {
            ok: true,
            outDir,
            files: ["qibid-pack.json", "看标/facts.json", "看标/scoring.json", "看标/reading.md", "看标/废标红线体检.html"],
            upgradeUrl: "https://qibid.lingqiai.online/download/?from=lite-mcp",
          };
        } else {
          throw new Error(`未知工具：${String(name)}`);
        }
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
        return;
      }
      if (id !== undefined) {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(req.method)}` } });
      }
    } catch (err) {
      if (id !== undefined) {
        send({ jsonrpc: "2.0", id, error: { code: -32000, message: err instanceof Error ? err.message : String(err) } });
      }
    }
  });
}

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
