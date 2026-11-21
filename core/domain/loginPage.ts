// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

import { stripTags } from "./htmlExtract.ts";

/**
 * B4 登录页特征判定：页面特征（快照），不读 Cookie。
 * 命中任一即当登录页：
 *  - 页面里的密码框 input[type=password] 占住页面主体（BL-35：登录墙才算，
 *    站点首页 header 自带的登录小框不算——否则正常页被登录交接卡住）；
 *  - URL 的 host/path 段含 login/passport/sso 且页面仍有「凭据控件」——
 *    用户名/账号/密码类输入框，或写着「登录/Sign in」的提交控件。
 *    （任意表单元素不算数：登录后的门户页也常有搜索框，URL 关键词在
 *    query 或锚点里也不算数：`?from=login`、`#section-login` 不是登录页；
 *    RB-9：但 SPA 哈希路由是真地址，`#/login`、`#!/sso` 算。
 *    SPA 登录后不换地址、只撤掉凭据控件 → 这时不算登录页。）
 * 不做验证码识别，也不自动填用户名密码——命中后由对话里的「登录交接卡」交还给用户。
 */
const LOGIN_URL_RE = /login|passport|sso/i;
const PASSWORD_INPUTS_RE = /<input\b(?=[^>]*?type\s*=\s*["']?password(?=["'\s/>]|$))[^>]*>/gi;
// 凭据特征：用户/账号类输入框，或登录语义按钮/提交控件。
const CREDENTIAL_RE = /<input\b[^>]*?(?:name|id|placeholder|aria-label)\s*=\s*["'][^"']*(?:user|account|login|passw?d?|phone|mail|用户名|账号|密码|手机|邮箱)[^"']*["']/i;
const LOGIN_CONTROL_RE = /<(button|input)\b[^>]*?(?:登录|登入|sign\s*in|log\s*in)[^>]*>|<(button|a)\b[^>]*>[^<]{0,40}(?:登录|登入|sign\s*in|log\s*in)/i;

/** 登录墙判定参数：抠掉登录框后页面正文剩这么多字以内就算登录墙；或登录框占页面文字一半以上。 */
const LOGIN_WALL_REST_MAX = 120;
const LOGIN_WALL_SHARE = 0.5;

function urlLooksLoginish(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    // RB-9：SPA 哈希路由（#/login、#!/sso）是真登录页地址；锚点 #section-login 不算。
    const hashRoute = /^#(\/|!\/)/.test(u.hash);
    return LOGIN_URL_RE.test(u.hostname) || LOGIN_URL_RE.test(u.pathname)
      || (hashRoute && LOGIN_URL_RE.test(u.hash));
  } catch {
    return LOGIN_URL_RE.test(rawUrl);
  }
}

/**
 * BL-35 纯函数：密码框所在登录区域（enclosing form；不在 form 里就取输入框前后窗口）
 * 的可见文本。返回 null 表示页面没有密码框。
 */
export function loginBoxTextFromHtml(html: string): string | null {
  let best: string | null = null;
  for (const match of html.matchAll(PASSWORD_INPUTS_RE)) {
    const at = match.index ?? 0;
    const before = html.slice(0, at);
    // 最近一个还没被 </form> 关掉的 <form> 才算 enclosing form。
    let openAt = -1;
    for (const tag of before.matchAll(/<\/?form\b[^>]*>/gi)) {
      openAt = tag[0].startsWith("</") ? -1 : (tag.index ?? -1);
    }
    let region: string;
    if (openAt >= 0) {
      const tail = html.slice(at);
      const close = /<\/form\s*>/i.exec(tail);
      region = close !== null ? html.slice(openAt, at + close.index + close[0].length) : html.slice(openAt, Math.min(html.length, at + 4000));
      // ASP.NET WebForms 站整页包在一个 <form runat=server> 里——form 区域盖过
      // 整页文字时它就不是「登录框容器」，退回输入框前后窗口，否则恒判登录墙。
      const regionText = stripTags(region.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ""));
      const pageText = stripTags(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ""));
      if (pageText.length > 0 && regionText.length / pageText.length > 0.7) {
        region = html.slice(Math.max(0, at - 2000), Math.min(html.length, at + 2000));
      }
    } else {
      region = html.slice(Math.max(0, at - 2000), Math.min(html.length, at + 2000));
    }
    const text = stripTags(region.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")).replace(/\s+/g, " ").trim();
    if (best === null || text.length > best.length) best = text;
  }
  return best;
}

/** BL-35 纯函数：登录框是不是页面主体——抠掉它后正文见底，或它本身就占了大半文本。 */
export function loginBoxDominates(pageText: string, loginBoxText: string): boolean {
  const total = pageText.replace(/\s+/g, " ").trim().length;
  const form = loginBoxText.replace(/\s+/g, " ").trim().length;
  const rest = Math.max(0, total - form);
  return rest <= LOGIN_WALL_REST_MAX || (total > 0 && form / total >= LOGIN_WALL_SHARE);
}

/** BL-35：密码框存在且占住页面主体 → 登录墙。首页角落的登录小框不算。 */
export function loginWall(page: { html?: string; text?: string }): boolean {
  const html = page.html ?? "";
  const box = loginBoxTextFromHtml(html);
  if (box === null) return false;
  const text = page.text !== undefined && page.text.trim() !== "" ? page.text : stripTags(html);
  return loginBoxDominates(text, box);
}

export function isLoginPage(page: { url?: string; html?: string; text?: string }): boolean {
  const html = String(page.html ?? "");
  // 密码框要占住页面主体才算登录墙：首页自带登录框不抢正文（BL-35）。
  if (loginWall(page.text === undefined ? { html } : { html, text: page.text })) return true;
  if (!urlLooksLoginish(String(page.url ?? ""))) return false;
  if (html === "") return true; // 拿不到 html 时按 URL 特征保守收口
  return CREDENTIAL_RE.test(html) || LOGIN_CONTROL_RE.test(html);
}

export function loginPageHost(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
