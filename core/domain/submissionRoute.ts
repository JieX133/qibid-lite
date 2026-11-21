// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

/**
 * J-3 递交方式与平台操作：公告里「在哪投、用什么客户端、要不要 CA/解密」。
 * 确定性抽取——每个非空字段都带原文行；没有就不编，整条都没有返回 null。
 * 解密规则复用 J-1 keyDates 的抽取，两边说的是同一句话。
 */

import { extractKeyDates } from "./keyDates.ts";

export interface SubmissionRoute {
  /** online = 电子递交；offline = 纸质/现场；mixed = 两种都写了。 */
  mode: "online" | "offline" | "mixed" | null;
  /** 平台名（「登录“X”系统」或已知平台名）。 */
  platform: string | null;
  /** 与平台同句出现的网址。 */
  platformUrl: string | null;
  /** 投标客户端/制作工具名。 */
  clientTool: string | null;
  /** 需要电子签章 / CA 证书。 */
  eSign: boolean | null;
  /** 解密时限规则（J-1 的解密句，比如「提交截止后 30 分钟内完成解密」）。 */
  decryptRule: string | null;
  /** 不见面 / 远程开标。 */
  remoteOpening: boolean | null;
  /** 上传文件大小/格式限制那句。 */
  uploadLimits: string | null;
  /** 每个非空字段的原文行（截 160 字）。 */
  quotes: Partial<Record<"mode" | "platform" | "clientTool" | "eSign" | "decryptRule" | "remoteOpening" | "uploadLimits", string>>;
}

/** 已知采购平台名——「登录“X”系统」之外还能认出的。 */
const KNOWN_PLATFORMS = [
  "苏采云", "政采云", "国e采", "粤采易", "徽采云", "赣云采", "桂采云",
  "云南省政府采购电子交易平台", "浙江政府采购云平台", "山东政府采购云平台",
  "中直机关电子采购", "军队采购网", "中招联合", "易采虹", "阳光采购服务平台",
];

const QUOTE_LEN = 160;
const clip = (line: string) => line.trim().slice(0, QUOTE_LEN);

const ONLINE = /上传投标文件|线上递交|网上递交|电子投(?:标|响应|采购)文件|提交（上传）投标文件|线上提交|电子采购系统.*网上投标|网上投标|网上开标|电子招（投|标）/;
const OFFLINE = /纸质(?:投标|响应|报价)?文件|纸质文件|现场递交|密封递交|递交纸质/;
const URL_RE = /https?:\/\/[^\s）)》)"'\]，,；;]+/;

export function extractSubmissionRoute(text: string): SubmissionRoute | null {
  const route: SubmissionRoute = {
    mode: null, platform: null, platformUrl: null, clientTool: null,
    eSign: null, decryptRule: null, remoteOpening: null, uploadLimits: null, quotes: {},
  };
  let online = false;
  let offline = false;
  let modeQuote: string | null = null;
  const toolCandidates: Array<{ name: string; quote: string }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    // 平台名：已知名优先；否则「登录“X”系统/平台」里的引号名。同句带网址一起记。
    if (route.platform === null) {
      const quoted = /登录?[“"]([^”"]{2,24})[”"](?:系统|平台|网站)?/.exec(line) ?? /在\s*[“"]([^”"]{2,24})[”"](?:系统|平台)/.exec(line);
      const known = KNOWN_PLATFORMS.find((name) => line.includes(name));
      const name = known ?? quoted?.[1];
      if (name !== undefined && name !== null && name !== "") {
        route.platform = name;
        route.quotes.platform = clip(line);
        const url = URL_RE.exec(line);
        if (url !== null) route.platformUrl = url[0];
      }
    }
    if (route.platformUrl === null && route.platform !== null && line.includes(route.platform)) {
      const url = URL_RE.exec(line);
      if (url !== null) route.platformUrl = url[0];
    }

    // 递交方式
    if (!online && ONLINE.test(line)) {
      online = true;
      modeQuote ??= clip(line);
    }
    if (!offline) {
      for (const hit of line.matchAll(new RegExp(OFFLINE.source, "g"))) {
        // 「无需提供纸质响应文件」「不接受现场递交」是否定句——不是线下递交。
        if (/不需要|无需|不要|不接受|免于|取消|不要求/.test(line.slice(Math.max(0, (hit.index ?? 0) - 8), hit.index ?? 0))) continue;
        offline = true;
        modeQuote ??= clip(line);
        break;
      }
    }

    // 不见面 / 远程开标 / 开标大厅
    if (route.remoteOpening === null && /不见面|远程开标|网上开标大厅|开标大厅/.test(line)) {
      route.remoteOpening = true;
      route.quotes.remoteOpening = clip(line);
    }

    // 客户端 / 制作工具——同行可能写好几个名，最后统一挑最具体的那个。
    for (const hit of line.matchAll(/(投标文件制作工具|投标文件客户端|投标工具（新）|政府采购客户端工具|[一-龥A-Za-z0-9]{2,14}(?:电子交易|投标|电子投标|采购)客户端(?:工具)?)/g)) {
      toolCandidates.push({ name: hit[1] ?? hit[0], quote: clip(line) });
    }

    // 电子签章 / CA
    if (route.eSign === null && /电子签章|CA签章|CA证书|电子签名|CA 数字证书/.test(line)) {
      route.eSign = true;
      route.quotes.eSign = clip(line);
    }

    // 上传大小/格式限制：同句要提上传/递交/文件
    if (route.uploadLimits === null && /大小|不超过|限制|M[Bb]|格式/.test(line) && /上传|递交|提交|投标文件|压缩/.test(line)) {
      route.uploadLimits = clip(line);
      route.quotes.uploadLimits = clip(line);
    }
  }

  route.mode = online && offline ? "mixed" : online ? "online" : offline ? "offline" : null;
  if (route.mode !== null && modeQuote !== null) route.quotes.mode = modeQuote;

  // 客户端名：优先含「电子交易/制作」的具体名；截掉前缀动词（请登录/并导入）。
  const firstTool = toolCandidates[0];
  if (firstTool !== undefined) {
    const picked = toolCandidates.find((item) => /电子交易|制作/.test(item.name)) ?? firstTool;
    const name = picked.name.replace(/^(供应商将|供应商|请将|须将|需将|请登录|请|登陆|登录|并导入|导入|使用|使用安装|下载安装|下载|安装|须|需|应|在|将|通过)+/, "");
    route.clientTool = name === "" ? picked.name : name;
    route.quotes.clientTool = picked.quote;
  }

  // 解密规则与 J-1 同一句：offsetMinutes 版或「开标时在平台解密」版。
  const decrypt = extractKeyDates(text).find((item) => item.kind === "decrypt");
  if (decrypt !== undefined && decrypt.rule !== undefined) {
    route.decryptRule = decrypt.rule;
    route.quotes.decryptRule = decrypt.quote;
  }

  const any = route.mode !== null || route.platform !== null || route.clientTool !== null
    || route.eSign !== null || route.decryptRule !== null || route.remoteOpening !== null || route.uploadLimits !== null;
  return any ? route : null;
}

export interface RouteStep {
  id: string;
  item: string;
  detail: string;
}

/**
 * 线上/混合标的平台操作七步——缺数据的步骤用通用写法，不编具体名。
 * 第 4 步的签章处数由调用方在读完章节后填 detail。
 */
export function submissionRouteSteps(route: SubmissionRoute): RouteStep[] {
  const client = route.clientTool ?? "投标客户端";
  const platform = route.platform ?? "采购平台";
  return [
    { id: "route-1", item: `装最新版${client}`, detail: route.quotes.clientTool ?? "" },
    { id: "route-2", item: `插好 CA 证书并在${platform}绑定`, detail: "" },
    { id: "route-3", item: "导入招标文件开始制作", detail: "" },
    { id: "route-4", item: "按签章位置表签章", detail: "" },
    { id: "route-5", item: "生成加密投标文件", detail: "" },
    { id: "route-6", item: "截止前上传并保存回执", detail: "" },
    { id: "route-7", item: `开标时解密${route.decryptRule === null ? "" : `（${route.decryptRule}）`}`, detail: route.quotes.decryptRule ?? "" },
  ];
}

export interface SignPlace {
  chapter: string;
  line: string;
}

/** 签章位置表：格式/表格类章节里写「盖章/签字/签章」的行——给第 4 步数的处数。 */
export function signPlaceRows(chapters: ReadonlyArray<{ title: string; text: string; format?: boolean }>): SignPlace[] {
  const rows: SignPlace[] = [];
  for (const chapter of chapters) {
    if (chapter.format === false) continue;
    for (const raw of chapter.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === "" || line.length > 80) continue;
      if (/（盖章|公章|签字|签章|签名）/.test(line)) rows.push({ chapter: chapter.title, line: line.slice(0, 80) });
    }
  }
  return rows;
}
