// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import { findAttachments } from "./attachmentFinder.ts";
import type { AttachmentItem } from "./types.ts";

/**
 * 与站点无关的 HTML 抽取：从任意列表页挑出公告链接，从任意详情页挑出附件与正文。
 * 不依赖 DOM（服务端运行）；只用稳健的正则 + 打分，宁缺毋滥。
 */

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

export function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z#0-9]+);/gi, (m, name: string) => ENTITY[name.toLowerCase()] ?? m);
}

export function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string, cap = 40_000): string {
  const stripped = html
    .replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_all, level: string, inner: string) => `\n${"#".repeat(Math.min(4, Number(level)))} ${stripTags(inner)}\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article)>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "");
  return decodeHtml(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

export function resolveUrl(href: string, base: string): string | null {
  const raw = decodeHtml(href.trim());
  if (raw === "" || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

export interface PageLink {
  url: string;
  text: string;
  /** 链接之后同一行里的文字（常含日期、地区、采购人）。 */
  context: string;
  index: number;
}

export function extractLinks(html: string, base: string): PageLink[] {
  const out: PageLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const attrs = m[1] ?? "";
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3] ?? "";
    const onclick = /onclick\s*=\s*"[^"]*?['"]([^'"]+\.(?:s?html?|jsp|aspx?|php)[^'"]*)['"]/i.exec(attrs)?.[1];
    const url = resolveUrl(raw !== "" && !/^javascript/i.test(raw) ? raw : onclick ?? "", base);
    if (url === null) continue;
    const titleAttr = /title\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const inner = stripTags(m[2] ?? "");
    const titled = decodeHtml(titleAttr?.[1] ?? titleAttr?.[2] ?? "").trim();
    const text = titled.length > inner.length ? titled : inner;
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const stop = after.search(/<a\b|<\/(tr|li)>/i);
    const context = stripTags(stop >= 0 ? after.slice(0, stop) : after).slice(0, 160);
    out.push({ url, text, context, index: m.index });
  }
  return out;
}

const NOTICE_WORD = /公告|招标|采购|项目|磋商|谈判|询价|比选|遴选|中标|成交|结果|更正|澄清|竞价|单一来源|邀请/;
const NAV_WORD = /^(首页|上一页|下一页|尾页|末页|更多|返回|登录|注册|English|网站地图|联系我们|关于我们|\d+)$/;

export function findDate(text: string): string {
  const m = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(text);
  if (m === null) return "";
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

export interface ListingItem {
  title: string;
  url: string;
  publishedAt: string;
  context: string;
}

/** 从列表 / 搜索结果页挑出公告条目。linkPattern：用户可选的 href 子串或 /正则/。 */
export function extractListing(html: string, base: string, linkPattern?: string): ListingItem[] {
  const matcher = patternOf(linkPattern);
  const seen = new Set<string>();
  const items: ListingItem[] = [];
  for (const link of extractLinks(html, base)) {
    const title = link.text.replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 160 || NAV_WORD.test(title)) continue;
    if (/\.(pdf|docx?|xlsx?|zip|rar|7z|jpg|png)(\?|$)/i.test(link.url)) continue;
    if (matcher !== null) {
      if (!matcher(link.url)) continue;
    } else if (!NOTICE_WORD.test(title)) {
      continue;
    }
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    items.push({ title, url: link.url, publishedAt: findDate(link.context) || findDate(title), context: link.context });
  }
  return items;
}

function patternOf(pattern: string | undefined): ((url: string) => boolean) | null {
  const text = pattern?.trim() ?? "";
  if (text === "") return null;
  const re = /^\/(.+)\/([gimsuy]*)$/.exec(text);
  if (re !== null) {
    try {
      const compiled = new RegExp(re[1] ?? "", re[2]);
      return (url) => compiled.test(url);
    } catch {
      return (url) => url.includes(text);
    }
  }
  return (url) => url.includes(text);
}

const FILE_EXT = /\.(pdf|docx?|xlsx?|wps|et|zip|rar|7z|txt|ofd|gef|jpg|png)(?:[?#]|$)/i;

function kindOf(name: string, url: string): string {
  const ext = FILE_EXT.exec(name)?.[1] ?? FILE_EXT.exec(url)?.[1] ?? "";
  return ext.toLowerCase();
}

/** 详情页里的附件链接。签名不变，发现交给 attachmentFinder。 */
export function extractAttachments(html: string, base: string): AttachmentItem[] {
  return findAttachments({ html, baseUrl: base }).candidates.map((item) => ({
    name: item.name.slice(0, 120),
    kind: kindOf(item.name, item.url),
    sizeKb: 0,
    url: item.url,
  }));
}

/** 从文件名推断下载后应有的扩展名。 */
export function fileNameFor(item: AttachmentItem, contentType = "", disposition = ""): string {
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  let name = fromHeader === undefined ? item.name : safeDecode(fromHeader);
  name = name.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "附件";
  if (!/\.[a-z0-9]{2,4}$/i.test(name)) {
    const ext = item.kind !== "" ? item.kind
      : /pdf/.test(contentType) ? "pdf"
        : /wordprocessingml/.test(contentType) ? "docx"
          : /msword/.test(contentType) ? "doc"
            : /spreadsheetml/.test(contentType) ? "xlsx"
              : /zip/.test(contentType) ? "zip"
                : "";
    if (ext !== "") name = `${name}.${ext}`;
  }
  return name.slice(0, 120);
}

function safeDecode(text: string): string {
  try { return decodeURIComponent(text); } catch { return text; }
}

function decoderFor(charset: string): TextDecoder {
  const name = charset.toLowerCase() === "gb2312" ? "gbk" : charset;
  return new TextDecoder(name);
}

/** 页面编码：BOM，其次 Content-Type，HTML 才看 meta。无 charset 的 JSON 按 UTF-8，不猜 UTF-16。 */
export function decodeBody(bytes: Uint8Array, contentType = ""): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  const headerCharset = /charset\s*=\s*["']?([\w.-]+)/i.exec(contentType)?.[1];
  const type = contentType.toLowerCase();
  if (headerCharset === undefined && /application\/(?:json|[\w.+-]+\+json)/.test(type)) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
  const metaCharset = /<\s*meta[^>]+charset\s*=\s*["']?([\w.-]+)/i.exec(head)?.[1]
    ?? /<\s*meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w.-]+)/i.exec(head)?.[1];
  const charset = (headerCharset ?? metaCharset ?? "utf-8").toLowerCase();
  try {
    return decoderFor(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const SHELL_PAGE = /暂无详细数据|交易公开详情|页面正在建设|您访问的页面不存在/;
const NOTICE_WORDS = ["采购", "招标", "投标", "公告", "预算", "供应商", "开标", "磋商", "谈判", "询价", "中标", "成交", "项目编号", "采购人"];

/** 抓到的正文能不能当招标公告。页面框架和过短文本不算成功。 */
export function noticeBodyUsable(text: string): { ok: true } | { ok: false; reason: string } {
  const body = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (SHELL_PAGE.test(body)) return { ok: false, reason: "页面是框架，没有公告正文" };
  if (body.length < 500) return { ok: false, reason: "抓到的文字太短，不像招标公告" };
  if (!looksLikeNotice(body)) return { ok: false, reason: "没有识别到招标公告正文" };
  return { ok: true };
}

/** 抓到的页面像不像一篇招标公告：挡住首页、404 页、登录页被当成正文写进项目夹。 */
export function looksLikeNotice(text: string): boolean {
  const body = text.trim();
  if (body.length < 120) return false;
  if (/(页面不存在|找不到页面|404 Not Found|访问的页面已删除|系统繁忙)/i.test(body.slice(0, 2000))) return false;
  const hits = NOTICE_WORDS.filter((word) => body.includes(word)).length;
  return hits >= 3;
}

const PLATFORM_HINT = /(交易平台|采购平台|电子招投标|投标文件制作|获取招标文件|下载招标文件|供应商端|CA|投标客户端|报名)/;

/** 公告里指向交易平台 / 招标文件获取入口的链接（招标文件不挂在公告上、要到平台下载时）。 */
export function extractPlatformLinks(html: string, base: string): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  let host = "";
  try { host = new URL(base).hostname; } catch { host = ""; }
  for (const link of extractLinks(html, base)) {
    let other = "";
    try { other = new URL(link.url).hostname; } catch { continue; }
    if (other === host || /gov\.cn$/.test(other) && other.endsWith(host.replace(/^www\./, ""))) continue;
    if (/beian|jiucuo|miit|zfwzgl/.test(other)) continue;
    if (!PLATFORM_HINT.test(link.text) && !/ggzy|zfcg|ebid|bidding|tpbidder|zbtb|cgpt|jyzx/i.test(link.url)) continue;
    if (out.some((item) => item.url === link.url)) continue;
    out.push({ name: link.text.trim().slice(0, 40) || other, url: link.url });
  }
  return out.slice(0, 6);
}
