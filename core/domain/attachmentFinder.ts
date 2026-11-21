// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

/**
 * 从公告 HTML 里找附件。用 node-html-parser 建 DOM，不再用正则切标签。
 * 不引用 htmlExtract，避免环。
 */

import { parse, type HTMLElement } from "node-html-parser";

import { urlFromOnclick } from "./attachmentSiteRules.ts";

export type AttachmentVia = "href" | "onclick" | "data-attr" | "iframe" | "embed" | "json" | "text-url";
export type AttachmentConfidence = "high" | "medium" | "low";

export interface AttachmentCandidate {
  name: string;
  url: string;
  via: AttachmentVia;
  confidence: AttachmentConfidence;
  frameUrl?: string;
}

export interface FindAttachmentsInput {
  html: string;
  baseUrl: string;
  frames?: Array<{ url: string; html: string }>;
}

export interface FindAttachmentsResult {
  candidates: AttachmentCandidate[];
  /** iframe/frame/embed/object 指向的页面（不是文件）。调用方最多再抓 3 个。 */
  framePages: string[];
}

const FILE_EXT = /\.(pdf|docx?|xlsx?|wps|et|zip|rar|7z|txt|ofd|gef)(?:[?#]|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|svg|webp|ico|bmp)(?:[?#]|$)/i;
const SITE_CHROME = /(?:^|[\\/_-])(?:nav|logo|weixin|wechat|ghs|qrcode|ewm|icon|banner|footer|header|beian)(?:[_\d.-]|$)/i;
const FILE_WORD = /附件|下载|招标文件|采购文件|磋商文件|谈判文件|图纸|清单|更正文件/;
const FILE_URL_HINT = /oss\/download|fileApi\/|gpx-public-file|downloadFile|fileDownload|openFile|\/download\b|getfile|attach|upload|\/fj\b/i;
const NAV_DOWNLOAD = /下载中心|APP\s*下载|客户端下载|软件下载|资料下载|下载专区|手机下载|扫码下载/;
const BARE_URL = /https?:\/\/[^\s"'<>]+?\.(?:pdf|docx?|xlsx?|wps|et|zip|rar|7z|txt|ofd|gef)(?:\?[^\s"'<>]*)?/gi;
const JSON_KEY = /["']?(?:fileUrl|attachUrl|filePath|fileURL|attachURL)["']?\s*[:=]\s*["']([^"']+)["']/gi;

function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function resolveUrl(href: string, base: string): string | null {
  const raw = decodeHtml(href).trim();
  if (raw === "" || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(path);
  } catch {
    return "";
  }
}

function isFileUrl(url: string): boolean {
  return FILE_EXT.test(url) || FILE_URL_HINT.test(url);
}

function isNav(name: string, url: string): boolean {
  return NAV_DOWNLOAD.test(name) && !FILE_EXT.test(url);
}

interface Bucket {
  candidates: AttachmentCandidate[];
  framePages: string[];
  byUrl: Map<string, AttachmentCandidate>;
}

function isDecorativeImage(url: string, name: string): boolean {
  const file = `${name} ${fileNameFromUrl(url)}`;
  if (!IMAGE_EXT.test(url) && !IMAGE_EXT.test(name)) return false;
  if (SITE_CHROME.test(file) || SITE_CHROME.test(url)) return true;
  return !FILE_URL_HINT.test(url) && !/附件|图纸|扫描/.test(name);
}

function add(bucket: Bucket, item: AttachmentCandidate): void {
  const name = item.name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (name === "" && item.url === "") return;
  if (isNav(name, item.url) || isDecorativeImage(item.url, name)) return;
  const readable = name.length >= 2 ? name : fileNameFromUrl(item.url) || "附件";
  const prev = bucket.byUrl.get(item.url);
  if (prev === undefined) {
    const next = { ...item, name: readable };
    bucket.byUrl.set(item.url, next);
    bucket.candidates.push(next);
    return;
  }
  if (readable.length > prev.name.length) prev.name = readable;
}

function attr(el: HTMLElement, name: string): string {
  return decodeHtml(el.getAttribute(name) ?? "").trim();
}

function scanDocument(html: string, base: string, frameUrl: string | undefined, bucket: Bucket): void {
  let root: HTMLElement;
  try {
    root = parse(html);
  } catch {
    return;
  }
  const frame = frameUrl === undefined ? {} : { frameUrl };

  for (const el of root.querySelectorAll("a")) {
    const href = attr(el, "href");
    const onclick = attr(el, "onclick");
    const text = decodeHtml(el.text ?? "").replace(/\s+/g, " ").trim();
    const title = attr(el, "title");
    const label = text.length >= title.length ? text : title;
    const id = attr(el, "id");
    const cls = attr(el, "class");
    if ((/\bbizDownload\b/.test(cls) || title.includes("点击下载")) && /^[0-9a-f-]{8,}$/i.test(id)) {
      add(bucket, {
        name: label || "附件",
        url: `http://download.ccgp.gov.cn/oss/download?uuid=${id}`,
        via: "data-attr",
        confidence: "high",
        ...frame,
      });
    }
    const jsSource = /^javascript:/i.test(href) ? `${href} ${onclick}` : onclick;
    if (jsSource !== "") {
      const hit = urlFromOnclick(jsSource, base);
      if (hit !== null && isFileUrl(hit.url)) {
        add(bucket, { name: label || fileNameFromUrl(hit.url) || "附件", url: hit.url, via: "onclick", confidence: FILE_EXT.test(hit.url) ? "high" : "medium", ...frame });
      }
    }
    const url = resolveUrl(href, base);
    if (url !== null) {
      const byExt = FILE_EXT.test(url) || FILE_EXT.test(label);
      const byWord = FILE_WORD.test(label) && FILE_URL_HINT.test(url);
      const byHint = FILE_URL_HINT.test(url) && (byExt || label.length >= 2);
      if (byExt || byWord || byHint) {
        const confidence: AttachmentConfidence = byExt ? "high" : "medium";
        add(bucket, { name: label || fileNameFromUrl(url) || "附件", url, via: "href", confidence, ...frame });
      }
    }
    for (const key of ["data-url", "data-href", "data-file", "data-download"] as const) {
      const raw = attr(el, key);
      const dataUrl = resolveUrl(raw, base);
      if (dataUrl === null) continue;
      add(bucket, {
        name: label || fileNameFromUrl(dataUrl) || "附件",
        url: dataUrl,
        via: "data-attr",
        confidence: FILE_EXT.test(dataUrl) ? "medium" : "low",
        ...frame,
      });
    }
  }

  for (const el of root.querySelectorAll("[data-url], [data-href], [data-file], [data-download]")) {
    if (el.tagName.toUpperCase() === "A") continue;
    const label = decodeHtml(el.text ?? "").replace(/\s+/g, " ").trim();
    for (const key of ["data-url", "data-href", "data-file", "data-download"] as const) {
      const dataUrl = resolveUrl(attr(el, key), base);
      if (dataUrl === null || !isFileUrl(dataUrl)) continue;
      add(bucket, {
        name: label || fileNameFromUrl(dataUrl) || "附件",
        url: dataUrl,
        via: "data-attr",
        confidence: FILE_EXT.test(dataUrl) ? "medium" : "low",
        ...frame,
      });
    }
  }

  for (const el of root.querySelectorAll("iframe, frame, embed, object")) {
    const raw = attr(el, "src") || attr(el, "data");
    const url = resolveUrl(raw, base);
    if (url === null) continue;
    const via: AttachmentVia = el.tagName.toUpperCase() === "EMBED" ? "embed" : "iframe";
    if (isFileUrl(url)) {
      add(bucket, { name: fileNameFromUrl(url) || "附件", url, via, confidence: "high", ...frame });
    } else if (!bucket.framePages.includes(url)) {
      bucket.framePages.push(url);
    }
  }

  for (const el of root.querySelectorAll("script")) {
    const source = el.text ?? "";
    JSON_KEY.lastIndex = 0;
    for (let match = JSON_KEY.exec(source); match !== null; match = JSON_KEY.exec(source)) {
      const url = resolveUrl(match[1] ?? "", base);
      if (url === null) continue;
      add(bucket, { name: fileNameFromUrl(url) || "附件", url, via: "json", confidence: "low", ...frame });
    }
  }

  BARE_URL.lastIndex = 0;
  const plain = decodeHtml(html);
  for (let match = BARE_URL.exec(plain); match !== null; match = BARE_URL.exec(plain)) {
    const url = resolveUrl(match[0] ?? "", base);
    if (url === null) continue;
    add(bucket, { name: fileNameFromUrl(url) || "附件", url, via: "text-url", confidence: "low", ...frame });
  }
}

export function findAttachments(input: FindAttachmentsInput): FindAttachmentsResult {
  const bucket: Bucket = { candidates: [], framePages: [], byUrl: new Map() };
  scanDocument(input.html, input.baseUrl, undefined, bucket);
  for (const frame of input.frames ?? []) {
    scanDocument(frame.html, frame.url, frame.url, bucket);
  }
  return { candidates: bucket.candidates, framePages: bucket.framePages };
}

export function kindOfAttachment(name: string, url: string): string {
  return (FILE_EXT.exec(name)?.[1] ?? FILE_EXT.exec(url)?.[1] ?? "").toLowerCase();
}
