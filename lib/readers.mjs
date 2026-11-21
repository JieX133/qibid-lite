// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * QiBid Lite 零外部依赖输入读取器：
 * - .docx：纯 Node.js zlib 解析 ZIP 中心目录并提取 word/document.xml 段落与原生表格（保留评分表结构）
 * - .pdf：基础文本层抽取与扫描件/影印版自动探测（识别为扫描件时明确提示需离线 OCR）
 * - .html / .htm：调用确定性 htmlToText 提取干净正文
 * - https:// 公开招标公告 URL：SSRF 防护 + 15s 超时 + 5MB 上限 + 登录墙自动识别
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

const MAX_FETCH_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOCX_BYTES = 30 * 1024 * 1024;

function decodeXmlEntities(raw) {
  return String(raw ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 轻量纯 Node ZIP 解析器（仅用于读取 .docx 内 word/*.xml，支持 STORE=0 与 DEFLATE=8）。 */
function readZipEntries(buf) {
  const entries = new Map();
  // 查找 End of Central Directory (0x06054b50)
  let eocd = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("无效的 .docx 文件（未找到 ZIP 结束目录）");

  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let pos = cdOffset;
  const cdEnd = Math.min(buf.length, cdOffset + cdSize);

  while (pos + 46 <= cdEnd) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;

    if (!/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) continue;

    const slice = buf.subarray(dataStart, dataEnd);
    let raw;
    if (method === 0) raw = slice;
    else if (method === 8) raw = inflateRawSync(slice);
    else continue;
    entries.set(name, raw.toString("utf8"));
  }
  return entries;
}

function paragraphText(xmlFragment) {
  const runs = [];
  for (const m of xmlFragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
    if (m[1] !== undefined) runs.push(decodeXmlEntities(m[1]));
    else if (m[0].startsWith("<w:tab")) runs.push("\t");
    else runs.push("\n");
  }
  return runs.join("").replace(/[ \t]+/g, " ").trim();
}

function parseDocxXml(xml) {
  const tables = [];
  const lines = [];
  // 先抽出所有表格并替换为占位符，保留原文顺序与 Markdown 表格结构
  const tableBlocks = [];
  const withoutTables = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tblXml) => {
    const rows = [];
    for (const tr of tblXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells = [];
      for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
        const parts = [];
        for (const p of tc[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
          const t = paragraphText(p[0]);
          if (t) parts.push(t);
        }
        cells.push(parts.join(" ").replace(/\|/g, "｜").trim());
      }
      if (cells.some((c) => c !== "")) rows.push(cells);
    }
    if (rows.length > 0) {
      tables.push(rows);
      const colCount = Math.max(...rows.map((r) => r.length));
      const pad = (r) => Array.from({ length: colCount }, (_v, idx) => r[idx] ?? "");
      const mdRows = [
        `| ${pad(rows[0]).join(" | ")} |`,
        `| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`,
        ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
      ];
      tableBlocks.push(mdRows.join("\n"));
      return `<w:p><w:r><w:t>__QIBID_TBL_${tableBlocks.length - 1}__</w:t></w:r></w:p>`;
    }
    return "";
  });

  for (const p of withoutTables.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const text = paragraphText(p[0]);
    if (!text) continue;
    const tblMatch = /^__QIBID_TBL_(\d+)__$/.exec(text);
    if (tblMatch) {
      lines.push(tableBlocks[Number(tblMatch[1])]);
    } else {
      lines.push(text);
    }
  }
  return { text: lines.join("\n"), tables };
}

export function readDocxBytes(buf) {
  if (buf.length > MAX_DOCX_BYTES) {
    throw new Error(`文件体积超过 Lite 单文件上限（${Math.round(buf.length / 1024 / 1024)} MB > 30 MB）`);
  }
  const entries = readZipEntries(buf);
  const docXml = entries.get("word/document.xml");
  if (!docXml) throw new Error("未在 .docx 中找到 word/document.xml");
  const main = parseDocxXml(docXml);
  const headerTexts = [];
  for (const [k, v] of entries) {
    if (k === "word/document.xml") continue;
    const parsed = parseDocxXml(v);
    if (parsed.text) headerTexts.push(parsed.text);
  }
  const text = [...headerTexts, main.text].filter(Boolean).join("\n\n");
  return { kind: "docx", text, tables: main.tables, scanDetected: false };
}

function unescapePdfString(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodeHexUtf16Be(hex) {
  let str = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const code = Number.parseInt(hex.slice(i, i + 4), 16);
    if (code >= 0x20 && code !== 0xfeff) str += String.fromCharCode(code);
  }
  return str;
}

/** 从所有 FlateDecode / 明文流中收集 PDF ToUnicode CMap（beginbfchar / beginbfrange）。 */
function parseToUnicodeMaps(decodedStreams) {
  const cmap = new Map();
  for (const s of decodedStreams) {
    if (!s.includes("beginbfchar") && !s.includes("beginbfrange")) continue;
    for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const key = pair[1].toUpperCase();
        const val = decodeHexUtf16Be(pair[2]);
        if (val) cmap.set(key, val);
      }
    }
    for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const body = blk[1];
      for (const rng of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const start = Number.parseInt(rng[1], 16);
        const end = Number.parseInt(rng[2], 16);
        const pad = rng[1].length;
        const baseDst = Number.parseInt(rng[3], 16);
        if (end >= start && end - start <= 2048) {
          for (let code = start; code <= end; code += 1) {
            const key = code.toString(16).toUpperCase().padStart(pad, "0");
            const ch = String.fromCodePoint(baseDst + (code - start));
            cmap.set(key, ch);
          }
        }
      }
      for (const arr of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
        const start = Number.parseInt(arr[1], 16);
        const pad = arr[1].length;
        const dsts = [...arr[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => decodeHexUtf16Be(m[1]));
        for (let i = 0; i < dsts.length; i += 1) {
          const key = (start + i).toString(16).toUpperCase().padStart(pad, "0");
          if (dsts[i]) cmap.set(key, dsts[i]);
        }
      }
    }
  }
  return cmap;
}

function decodeHexTokenWithCmap(hex, cmap) {
  const upper = hex.toUpperCase();
  if (cmap.size > 0) {
    // 优先按 4 位 CID (2 字节) 查表，再退 2 位 (1 字节)
    let out4 = "";
    let hits4 = 0;
    if (upper.length % 4 === 0) {
      for (let i = 0; i < upper.length; i += 4) {
        const mapped = cmap.get(upper.slice(i, i + 4));
        if (mapped !== undefined) {
          out4 += mapped;
          hits4 += 1;
        }
      }
    }
    if (hits4 > 0) return out4;
    let out2 = "";
    let hits2 = 0;
    if (upper.length % 2 === 0) {
      for (let i = 0; i < upper.length; i += 2) {
        const mapped = cmap.get(upper.slice(i, i + 2));
        if (mapped !== undefined) {
          out2 += mapped;
          hits2 += 1;
        }
      }
    }
    if (hits2 > 0) return out2;
  }
  return decodeHexUtf16Be(upper);
}

function extractReadableTextFromPdfStream(streamText, cmap) {
  const lines = [];
  // 切分文本块 BT ... ET，按行保留换行（TD / Td / T* / TL 触发换行）
  for (const bt of streamText.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = bt[1];
    let cur = "";
    const tokenRe = /\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj|(T\*|-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+T[dD])/g;
    for (const m of body.matchAll(tokenRe)) {
      if (m[1] !== undefined) {
        // TJ 数组：拼接括号串与 <HEX> 串
        for (const item of m[1].matchAll(/<([0-9a-fA-F]+)>|\(([^()\\]*(?:\\.[^()\\]*)*)\)/g)) {
          if (item[1] !== undefined) cur += decodeHexTokenWithCmap(item[1], cmap);
          else if (item[2] !== undefined) cur += unescapePdfString(item[2]);
        }
      } else if (m[2] !== undefined) {
        cur += decodeHexTokenWithCmap(m[2], cmap);
      } else if (m[3] !== undefined) {
        cur += unescapePdfString(m[3]);
      } else if (m[4] !== undefined) {
        if (cur.trim()) {
          lines.push(cur.trim());
          cur = "";
        }
      }
    }
    if (cur.trim()) lines.push(cur.trim());
  }
  return lines.join("\n");
}

/**
 * 零依赖 PDF 文本抽取与扫描件探测：
 * - 解压所有 FlateDecode 流，提取 ToUnicode CMap（beginbfchar/beginbfrange）解码中文 CIDFont 文本；
 * - 严格按有效汉字数量（cjkCount < 50）与中文密度判定是否为扫描件/影印版/加密字库，
 *   绝不让纯页码 ASCII 骗过扫描件检测而吐出空报告。
 */
export function inspectPdfBytes(buf) {
  const latin1 = buf.toString("latin1");
  if (!latin1.startsWith("%PDF-")) {
    throw new Error("文件内容不是有效的 PDF 头（%PDF-）");
  }
  const pageMatches = latin1.match(/\/Type\s*\/Page\b(?!s)/g);
  const pageCount = pageMatches ? pageMatches.length : 1;
  const imageMatches = latin1.match(/\/Subtype\s*\/Image\b/g);
  const imageCount = imageMatches ? imageMatches.length : 0;

  const decodedStreams = [];
  let searchFrom = 0;
  let streamsScanned = 0;
  while (streamsScanned < 400) {
    const startIdx = latin1.indexOf("stream", searchFrom);
    if (startIdx < 0) break;
    const endIdx = latin1.indexOf("endstream", startIdx + 6);
    if (endIdx < 0) break;
    streamsScanned += 1;
    searchFrom = endIdx + 9;

    let dataStart = startIdx + 6;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a || buf[dataStart] === 0x0d) dataStart += 1;
    const rawSlice = buf.subarray(dataStart, endIdx);
    if (rawSlice.length === 0 || rawSlice.length > 6 * 1024 * 1024) continue;

    let textCandidate = "";
    try {
      const inflated = inflateSync(rawSlice);
      textCandidate = inflated.toString("latin1");
    } catch {
      textCandidate = rawSlice.toString("latin1");
    }
    if (textCandidate.includes("beginbfchar") || textCandidate.includes("beginbfrange") || (textCandidate.includes("BT") && (textCandidate.includes("Tj") || textCandidate.includes("TJ")))) {
      decodedStreams.push(textCandidate);
    }
  }

  const cmap = parseToUnicodeMaps(decodedStreams);
  const extracted = [];
  for (const s of decodedStreams) {
    if (s.includes("BT") && (s.includes("Tj") || s.includes("TJ"))) {
      const t = extractReadableTextFromPdfStream(s, cmap);
      if (t.trim()) extracted.push(t.trim());
    }
  }

  const text = extracted.join("\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const meaningfulLen = text.replace(/\s+/g, "").length;
  const scanDetected = cjkCount < 50;

  return {
    kind: scanDetected ? "pdf-scan" : "pdf-text",
    text,
    tables: [],
    pageCount,
    imageCount,
    cjkCount,
    scanDetected,
    upgradeReason: scanDetected
      ? `检测到该 PDF 共 ${pageCount} 页（含 ${imageCount} 个图像对象），零依赖文本层仅提取出 ${cjkCount} 个汉字（共 ${meaningfulLen} 字符），属于扫描件、盖章影印件或特殊编码字体。QiBid Lite 不含离线 OCR 与完整 PDF 字体渲染引擎；请导入启标桌面完整版（内置 pdf.js + 离线 OCR + 视觉多模态看标，文件留在本地）完整解析。`
      : null,
  };
}

export function isSafePublicUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL 格式不合法" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `仅允许 http/https 协议（拒绝 ${u.protocol}）` };
  }
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, reason: "缺少主机名" };
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::" ||
    host.startsWith("[::1]") ||
    host.startsWith("[fe80:") ||
    host.startsWith("[fc") ||
    host.startsWith("[fd") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, reason: `拒绝访问内网或本机地址：${host}` };
  }
  return { ok: true, url: u.toString(), host };
}

export async function fetchNoticeUrl(rawUrl, core) {
  const check = isSafePublicUrl(rawUrl);
  if (!check.ok) throw new Error(check.reason);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(check.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; QiBid-Lite/0.2; +https://qibid.lingqiai.online)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    const finalCheck = isSafePublicUrl(resp.url || check.url);
    if (!finalCheck.ok) throw new Error(`重定向目标被拒：${finalCheck.reason}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

    const ab = await resp.arrayBuffer();
    if (ab.byteLength > MAX_FETCH_BYTES) {
      throw new Error(`网页体积超过 5 MB 上限（${Math.round(ab.byteLength / 1024)} KB）`);
    }
    const bytes = new Uint8Array(ab);
    const ct = resp.headers.get("content-type") ?? "";
    const html = core.decodeBody ? core.decodeBody(bytes, ct) : core.decodeTextBytes(bytes);
    const text = core.htmlToText ? core.htmlToText(html, 80_000) : html;
    const loginWall = core.isLoginPage ? core.isLoginPage({ url: resp.url || check.url, html, text }) : false;
    const attachments = core.extractAttachments ? core.extractAttachments(html, resp.url || check.url) : [];
    const captchaHint = /验证码|滑块验证|人机校验|请拖动滑块|安全验证/.test(text) && text.length < 1200;

    return {
      kind: "url",
      name: finalCheck.host,
      sourceUrl: resp.url || check.url,
      text,
      tables: [],
      scanDetected: false,
      loginWall: loginWall || captchaHint,
      attachmentsCount: attachments.length,
      upgradeReason: loginWall || captchaHint
        ? `目标站点（${finalCheck.host}）需要人工登录或验证码校验。QiBid Lite 严禁绕过验证码或爬取登录态站点；请使用启标桌面完整版内置侧栏浏览器完成人工登录接管后一键导入公告与附件。`
        : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractMarkdownTables(text) {
  const tables = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= 2) tables.push(cur);
    cur = [];
  };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      cur.push(cells);
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

export async function readSourceInput(target, core) {
  if (/^https?:\/\//i.test(target)) {
    return fetchNoticeUrl(target, core);
  }
  const abs = resolve(target);
  if (!existsSync(abs)) throw new Error(`文件不存在：${abs}`);
  const buf = readFileSync(abs);
  const name = basename(abs);
  const ext = extname(abs).toLowerCase();

  if (ext === ".docx") {
    return { abs, name, ...readDocxBytes(buf) };
  }
  if (ext === ".pdf") {
    return { abs, name, ...inspectPdfBytes(buf) };
  }
  if (ext === ".html" || ext === ".htm") {
    const raw = core.decodeTextBytes(new Uint8Array(buf));
    const text = core.htmlToText ? core.htmlToText(raw, 120_000) : raw;
    return { abs, name, kind: "html", text, tables: extractMarkdownTables(text), scanDetected: false };
  }
  const text = core.decodeTextBytes(new Uint8Array(buf));
  return { abs, name, kind: "txt", text, tables: extractMarkdownTables(text), scanDetected: false };
}
