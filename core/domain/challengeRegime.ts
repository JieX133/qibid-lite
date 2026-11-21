// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 014 K-3：法规体系与公告期限的确定性抽取——只做文本识别，不下法律结论。
 * - 政府采购：政府采购法 / 政府采购公告措辞（采购人·采购单位+供应商、竞争性磋商/谈判/询价/单一来源、质疑、ccgp）。
 * - 依法必须招标：招标投标法（实施条例）/ 招标人+投标人+工程施工监理勘察设计 / 公共资源交易·工程建设 / 中标候选人公示。
 * - 两边信号都中或都不中 → 其他（不猜）。
 */
import { chinaDate } from "./workdayCalendar.ts";
import type { LegalRegime } from "./challengeWindows.ts";

const GOV_HARD = /政府采购法|政府采购网|ccgp\.gov\.cn|政府购买服务/;
const GOV_VOCAB = /采购单位|采购人|采购代理机构/;
const GOV_CONTEXT = /供应商|竞争性磋商|竞争性谈判|单一来源|询价|质疑/;
const TENDER_HARD = /招标投标法/;
const TENDER_SOFT = /中标候选人公示|公共资源交易[^。\n]{0,30}工程|工程建设[^。\n]{0,30}公共资源交易/;
const TENDER_CONTEXT = /工程施工|工程监理|勘察|设计/;

/** 法规体系判定：硬信号或「角色词+场景词」组合；两边都中或都不中 → 其他。 */
export function detectLegalRegime(text: string): LegalRegime {
  // 「适用招标投标法的政府采购工程建设项目」是中小企业价格扣除条款的样板文，不算引用。
  const textScrubbed = text.replaceAll("适用招标投标法", "");
  const gov = GOV_HARD.test(text) || (GOV_VOCAB.test(text) && GOV_CONTEXT.test(text));
  const tender = TENDER_HARD.test(textScrubbed)
    || TENDER_SOFT.test(text)
    || (/招标人/.test(text) && /投标人/.test(text) && TENDER_CONTEXT.test(text));
  if (gov === tender) return "其他";
  return gov ? "政府采购" : "依法必须招标";
}

/** 「自本公告发布之日起 N 个工作日」→ N；没写 → null。 */
export function extractNoticePeriodWorkdays(text: string): number | null {
  const hit = /自本公告发布之日起\s*(\d{1,2})\s*个工作日/.exec(text);
  return hit === null ? null : Number.parseInt(hit[1]!, 10);
}

const PUB_RE = /(?:发布时间|发布日期|公告日期|公告发布时间)\s*[:：]?\s*(\d{4})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})\s*[:：]\s*(\d{2}))?/;

/** 「发布时间：2026年09月20日 11:50」→ "2026-09-20T11:50"；只到日 → "2026-09-20"。 */
export function extractPublishedAt(text: string): string | null {
  const hit = PUB_RE.exec(text);
  if (hit === null) return null;
  const date = `${hit[1]}-${hit[2]!.padStart(2, "0")}-${hit[3]!.padStart(2, "0")}`;
  if (hit[4] === undefined) return date;
  return `${date}T${hit[4].padStart(2, "0")}:${hit[5]}`;
}

const METHODS = ["公开招标", "邀请招标", "竞争性磋商", "竞争性谈判", "竞争性评审", "询价", "单一来源", "框架协议", "电子卖场", "直接委托"] as const;

/** 采购/招标方式：先认「（采购|招标|发包）方式[:：] X」，再按文本中最早出现的已知方式。 */
export function extractProcurementMethod(text: string): string | null {
  const labeled = /(?:采购方式|招标方式|发包方式|采购形式)\s*[:：]?\s*([^\s|，,。；;]{2,12})/.exec(text);
  if (labeled !== null) {
    const known = METHODS.find((method) => labeled[1]!.includes(method));
    if (known !== undefined) return known;
    const trimmed = labeled[1]!.replace(/[（(].*$/, "").trim();
    if (trimmed !== "") return trimmed;
  }
  const first = METHODS.map((method) => ({ method, at: text.indexOf(method) })).filter((row) => row.at >= 0).sort((a, b) => a.at - b.at)[0];
  return first === undefined ? null : first.method;
}

/** 招标/采购公告页的组合抽取：facts 与结果表文件共用。 */
export function extractRegimeSignals(text: string): { legalRegime: LegalRegime; procurementMethod: string | null; noticePeriodWorkdays: number | null; publishedAt: string | null } {
  return {
    legalRegime: detectLegalRegime(text),
    procurementMethod: extractProcurementMethod(text),
    noticePeriodWorkdays: extractNoticePeriodWorkdays(text),
    publishedAt: extractPublishedAt(text),
  };
}

/** 结果公告的发布日（challengeWindows 的 resultPublishedAt 口径）：按日比。 */
export function resultPublishDay(publishedAt: string | null): string | null {
  return publishedAt === null ? null : chinaDate(publishedAt);
}
