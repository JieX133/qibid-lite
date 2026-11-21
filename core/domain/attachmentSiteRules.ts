// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

/**
 * 附件发现的站点规则：onclick 下载函数 → URL，以及登录/验证码闸门。
 * 夹具 HTML 里没有 download()/downloadFile() 等调用（已全量扫过），模板按公开页常见写法钉死，并在测试里用片段覆盖。
 */

import { htmlToText } from "./htmlExtract.ts";
import { loginBoxDominates, loginBoxTextFromHtml } from "./loginPage.ts";

export const USER_GATE_RE = /验证码|captcha|滑动验证|安全验证|请登录|登录后查看/i;
const CAPTCHA_RE = /验证码|captcha|滑动验证|安全验证/i;
const LOGIN_RE = /请登录|登录后查看/i;
/** 没有密码框证据时，整页文字薄到这个长度以下仍按「请登录占位页」收口。 */
const THIN_LOGIN_PAGE_MAX = 200;
/** 有密码框但不占主体时，登录词 + 抠掉登录框后剩余正文仍在这个长度以下才算登录墙
 *  （盖住「登录墙带大段导航/版权」；首页角落登录框 + 提示语但正文厚实的页不算）。 */
const LOGIN_WALL_REST_HINT_MAX = 400;

/** 验证码词优先于登录词。扫不到返回 undefined。 */
export function userGateFromText(text: string): "login" | "captcha" | undefined {
  const sample = text.slice(0, 30_000);
  if (CAPTCHA_RE.test(sample)) return "captcha";
  if (LOGIN_RE.test(sample)) return "login";
  return undefined;
}

/** 用户闸判定的页面视图：纯文本路径（text）或带 DOM 证据（html / 页内探测 loginBox）。 */
export interface UserGateView {
  /** 页面可见文本（innerText 或剥标签文本）；缺省时从 html 抽。 */
  text?: string;
  /** 页面 HTML——给了就能用「密码框占主体」判登录墙。 */
  html?: string;
  /** 调用方在页内探测好的密码框证据（CDP evaluate 路径），与 html 二选一。 */
  loginBox?: { found: boolean; text: string };
}

/**
 * BL-35：带 DOM 证据的用户闸判定。验证码词仍优先。
 * 登录判定分三路：
 *  - 有密码框：登录框占住页面主体（首屏登录模态/整页登录）才算登录墙——
 *    首页 header 自带的登录小框不挡正文采集；
 *  - 无密码框：只有整页就是一句「请登录」的薄占位页才认登录墙；
 *  - 纯文本入参（没有 DOM 证据）：维持旧的关键词判定。
 */
export function userGateFromPage(view: UserGateView): "login" | "captcha" | undefined {
  const html = view.html ?? "";
  const text = (view.text !== undefined && view.text.trim() !== "" ? view.text : htmlToText(html)).slice(0, 30_000);
  if (CAPTCHA_RE.test(text)) return "captcha";
  const box = view.loginBox ?? (html !== "" ? { found: loginBoxTextFromHtml(html) !== null, text: loginBoxTextFromHtml(html) ?? "" } : undefined);
  if (box === undefined) return LOGIN_RE.test(text) ? "login" : undefined;
  // 有密码框：占主体即登录墙；不占主体时，登录词 + 剩余正文薄于阈值才算墙——
  // 首页登录小框 + 「请登录后可下载」提示但正文厚实的页不算。
  if (box.found) {
    if (loginBoxDominates(text, box.text)) return "login";
    const rest = Math.max(0, text.trim().length - box.text.trim().length);
    return LOGIN_RE.test(text) && rest <= LOGIN_WALL_REST_HINT_MAX ? "login" : undefined;
  }
  return LOGIN_RE.test(text) && text.trim().length <= THIN_LOGIN_PAGE_MAX ? "login" : undefined;
}

export interface OnclickRule {
  id: string;
  build(arg: string, base: string): string | null;
}

function resolveHttp(arg: string, base: string): string | null {
  const raw = arg.trim();
  if (raw === "" || /^javascript:/i.test(raw)) return null;
  try {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
      return new URL(raw, base).toString();
    }
  } catch {
    return null;
  }
  return null;
}

function originOf(base: string): string | null {
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

function idUrl(base: string, path: string, arg: string): string | null {
  const direct = resolveHttp(arg, base);
  if (direct !== null) return direct;
  const origin = originOf(base);
  if (origin === null || arg.trim() === "") return null;
  return `${origin}${path}${encodeURIComponent(arg.trim())}`;
}

export const ONCLICK_RULES: readonly OnclickRule[] = [
  { id: "download", build: (arg, base) => resolveHttp(arg, base) },
  { id: "downloadFile", build: (arg, base) => idUrl(base, "/downloadFile?fileId=", arg) },
  { id: "window.open", build: (arg, base) => resolveHttp(arg, base) },
  { id: "location.href", build: (arg, base) => resolveHttp(arg, base) },
  { id: "fileDownload", build: (arg, base) => idUrl(base, "/fileDownload?id=", arg) },
  { id: "openFile", build: (arg, base) => idUrl(base, "/openFile?id=", arg) },
];

const CALLS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "window.open", re: /window\.open\s*\(\s*['"]([^'"]+)['"]/i },
  { id: "location.href", re: /location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i },
  { id: "downloadFile", re: /downloadFile\s*\(\s*['"]([^'"]+)['"]/i },
  { id: "fileDownload", re: /fileDownload\s*\(\s*['"]([^'"]+)['"]/i },
  { id: "openFile", re: /openFile\s*\(\s*['"]([^'"]+)['"]/i },
  { id: "download", re: /(?:^|[^\w.])download\s*\(\s*['"]([^'"]+)['"]/i },
];

export function urlFromOnclick(source: string, base: string): { url: string; ruleId: string } | null {
  for (const call of CALLS) {
    const arg = call.re.exec(source)?.[1];
    if (arg === undefined) continue;
    const rule = ONCLICK_RULES.find((item) => item.id === call.id);
    const url = rule?.build(arg, base) ?? null;
    if (url !== null) return { url, ruleId: call.id };
  }
  return null;
}
