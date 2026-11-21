// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

/**
 * J-1 关键日程：招标公告里递交截止之外的硬日期——获取文件截止、提疑截止、
 * 保证金到账、开标解密、现场踏勘。抽取只做确定性规则；日期写法复用
 * tenderValues 的 collectDateTimes（含「日下午5:00」全角写法）。
 */

import { collectDateTimes, type DateTimeHit } from "./tenderValues.ts";
import { addWorkdays } from "./workdayCalendar.ts";

export type KeyDateKind = "docObtainEnd" | "clarifyEnd" | "depositArrive" | "siteVisit" | "submitEnd" | "openAt" | "decrypt";

export interface KeyDate {
  kind: KeyDateKind;
  label: string;
  /** 与 TenderFacts.deadline 同口径 `YYYY-MM-DDTHH:mm`；原文只写日期时 `YYYY-MM-DD`。 */
  at: string | null;
  /** 人话规则（如「提交截止后 30 分钟内完成解密」）。 */
  rule?: string | undefined;
  /** 仅 decrypt：提交截止后多少分钟内解密。 */
  offsetMinutes?: number | undefined;
  /** 原文句子/表格行（截 160 字）。 */
  quote: string;
  /** siteVisit=false（不去不废标），其余 true。 */
  hard: boolean;
}

export const KEY_DATE_LABELS: Record<KeyDateKind, string> = {
  docObtainEnd: "获取招标文件截止",
  clarifyEnd: "提出疑问截止",
  depositArrive: "保证金到账截止",
  siteVisit: "现场踏勘",
  submitEnd: "投标截止",
  openAt: "开标",
  decrypt: "开标解密",
};

const QUOTE_LEN = 160;

/** 命中里的日期：有时刻带时刻，否则回到 `YYYY-MM-DD` 纯日期。 */
function hitAt(hit: DateTimeHit): string {
  return hit.hasTime ? hit.value : hit.value.slice(0, 10);
}

/** 行内孤立时刻（「上午:12:00 至 23:59」「下午5:00」）——最后一个时刻。 */
function lastLooseTime(line: string): string | null {
  let out: string | null = null;
  for (const match of line.matchAll(/(上午|下午|中午|晚上|凌晨|早上|傍晚)?\s*(\d{1,2})\s*[：:]\s*(\d{1,2})/g)) {
    const apm = match[1] ?? "";
    let hour = Number(match[2]);
    const minute = Number(match[3]);
    if (hour > 24 || minute > 59) continue;
    if (/下午|晚上|傍晚/.test(apm) && hour < 12) hour += 12;
    if (hour === 24) hour = 0;
    out = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return out;
}

/** 关键词后面最近的一个日期；关键词不在日期前时退回最后一个。 */
function dateAfter(line: string, fromIndex: number): DateTimeHit | null {
  const hits = collectDateTimes(line);
  return hits.find((hit) => hit.index >= fromIndex) ?? hits[hits.length - 1] ?? null;
}

/**
 * 从公告全文抽硬日期。只能抽出 docObtainEnd / clarifyEnd / depositArrive /
 * siteVisit / decrypt 五种——submitEnd/openAt 由 composeKeyDates 从 facts 补，
 * 这样更正改了截止/开标时间会自动跟上。一行没有可解析日期就不出（不编）。
 */
export function extractKeyDates(text: string): KeyDate[] {
  const out: KeyDate[] = [];
  const push = (kind: KeyDateKind, line: string, at: string | null, extra: Partial<KeyDate> = {}): void => {
    if (out.some((item) => item.kind === kind)) return;
    out.push({ kind, label: KEY_DATE_LABELS[kind], at, quote: line.trim().slice(0, QUOTE_LEN), hard: kind !== "siteVisit", ...extra });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    // 「获取招标文件时间/期限/截止日期/起止」——时间词必须贴着文件名，
    // 否则「获取采购文件，并于 X 前递交」里的（北京时间）会误食投标截止。
    if (/获取(?:招标|采购|磋商|谈判|询价|公开)?文件(?:的)?\s*(?:时间|期限|日期|截止|起止)/.test(line)
      || /(?:领取|领购)(?:招标|采购|磋商|谈判|询价|公开)?文件(?:的)?\s*(?:时间|期限|日期|截止|起止)/.test(line)) {
      const hits = collectDateTimes(line);
      const last = hits[hits.length - 1];
      if (last !== undefined) {
        let at = hitAt(last);
        if (!last.hasTime) {
          const loose = lastLooseTime(line);
          if (loose !== null) at = `${last.value.slice(0, 10)}T${loose}`;
        }
        push("docObtainEnd", line, at);
      }
    }
    const clarify = /(?:提出|递交|反馈|答复|提交).{0,8}(?:疑问|询问|澄清|异议|答疑|提问|质疑)/.exec(line)
      ?? /(?:疑问|询问|澄清|异议|答疑|提问|质疑).{0,30}(?:前|截止)/.exec(line);
    if (clarify !== null) {
      const hit = dateAfter(line, clarify.index);
      if (hit !== null) push("clarifyEnd", line, hitAt(hit));
    }
    if (/保证金/.test(line) && /到账|截止|之前|前缴|前汇|前交|前到/.test(line)) {
      const hits = collectDateTimes(line);
      const hit = hits[hits.length - 1];
      if (hit !== undefined) {
        let at = hitAt(hit);
        if (!hit.hasTime) {
          const loose = lastLooseTime(line);
          if (loose !== null) at = `${hit.value.slice(0, 10)}T${loose}`;
        }
        push("depositArrive", line, at);
      }
    }
    if (/踏勘/.test(line)) {
      const hit = collectDateTimes(line)[0];
      if (hit !== undefined) push("siteVisit", line, hitAt(hit));
    }
    const decrypt = /解密/.exec(line);
    if (decrypt !== null) {
      const offset = /截止(?:时间|日期|日)?后\s*(\d+)\s*分钟/.exec(line);
      if (offset !== null) {
        const minutes = Number(offset[1]);
        push("decrypt", line, null, { offsetMinutes: minutes, rule: `提交截止后 ${minutes} 分钟内完成解密` });
      } else {
        push("decrypt", line, null, { rule: "开标时在平台解密，时限以平台规定为准" });
      }
    }
  }
  return out;
}

const KIND_ORDER: Record<KeyDateKind, number> = { docObtainEnd: 0, clarifyEnd: 1, depositArrive: 2, siteVisit: 3, submitEnd: 4, openAt: 5, decrypt: 6 };

function toMs(at: string): number {
  return Date.parse(at.length === 10 ? `${at}T23:59` : at);
}

function addMinutes(at: string, minutes: number): string {
  const ms = Date.parse(at) + minutes * 60_000;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 存储抽取结果 + 当前 facts 合成完整日程：
 * submitEnd/openAt 用现在的 facts（更正会改它们），decrypt.at 由
 * deadline+offsetMinutes 或 openAt 填；按 at 排序，无时日期的排最后。
 * `自发布之日起 N 个工作日` 且没写死日期时：有 facts.publishedAt 才按
 * 工作日历推，规则注明「（节假日待核）」当推算落在官方表外的年份。
 */
export function composeKeyDates(
  stored: readonly KeyDate[],
  facts: { deadline: string | null; openAt: string | null; publishedAt?: string | null | undefined },
  text?: string,
): KeyDate[] {
  const out: KeyDate[] = stored
    .filter((item) => item.kind !== "submitEnd" && item.kind !== "openAt")
    .map((item) => ({ ...item }));
  if (facts.deadline !== null && facts.deadline !== "") {
    out.push({ kind: "submitEnd", label: KEY_DATE_LABELS.submitEnd, at: facts.deadline, quote: "", hard: true });
  }
  if (facts.openAt !== null && facts.openAt !== "") {
    out.push({ kind: "openAt", label: KEY_DATE_LABELS.openAt, at: facts.openAt, quote: "", hard: true });
  }
  const decrypt = out.find((item) => item.kind === "decrypt");
  if (decrypt !== undefined) {
    decrypt.at = decrypt.offsetMinutes !== undefined && facts.deadline !== null && facts.deadline !== ""
      ? addMinutes(facts.deadline, decrypt.offsetMinutes)
      : (facts.openAt !== null && facts.openAt !== "" ? facts.openAt : null);
  }
  // 「自…发布之日起 N 个工作日」且原文没写死获取截止——有发布日才可推。
  // 原文顺序两种都有：「获取采购文件…发布之日起5个工作日」或「自本公告发布之日起5个工作日…获取采购文件」。
  if (!out.some((item) => item.kind === "docObtainEnd" && item.at !== null) && text !== undefined) {
    const publish = facts.publishedAt;
    if (publish !== undefined && publish !== null && publish !== "" && /^\d{4}-\d{2}-\d{2}/.test(publish)) {
      for (const line of text.split(/\r?\n/)) {
        if (!/获取(?:招标|采购|磋商|谈判|询价|公开)?文件/.test(line)) continue;
        const rule = /(?:发布|发出|挂网)(?:之日|后|起){1,2}\s*(\d+)\s*个工作日/.exec(line);
        if (rule === null) continue;
        const n = Number(rule[1]);
        if (!Number.isInteger(n) || n < 1) continue;
        const pushed = addWorkdays(publish.slice(0, 10), n);
        out.push({
          kind: "docObtainEnd",
          label: KEY_DATE_LABELS.docObtainEnd,
          at: pushed.date,
          rule: `按公告发布起 ${n} 个工作日推算${pushed.verified ? "" : "（节假日待核）"}`,
          quote: line.trim().slice(0, QUOTE_LEN),
          hard: true,
        });
        break;
      }
    }
  }
  return [...out].sort((a, b) => {
    const am = a.at === null ? Number.POSITIVE_INFINITY : toMs(a.at);
    const bm = b.at === null ? Number.POSITIVE_INFINITY : toMs(b.at);
    return am !== bm ? am - bm : KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}

/** 下一个硬日期：at 未到/刚过都算还没过（按毫秒比较，当天全天项到当天 23:59）。 */
export function nextHardDate(dates: readonly KeyDate[], now: string): KeyDate | null {
  const nowMs = Date.parse(now.length === 10 ? `${now}T00:00` : now);
  let best: KeyDate | null = null;
  for (const item of dates) {
    if (!item.hard || item.at === null) continue;
    const ms = toMs(item.at);
    if (ms < nowMs) continue;
    if (best === null || ms < toMs(best.at!)) best = item;
  }
  return best;
}

/** 「M月D日 HH:mm」/「M月D日」（无时刻）。 */
export function keyDateCn(at: string): string {
  const [date, time] = at.split("T");
  const parts = (date ?? "").split("-").map(Number);
  const label = `${parts[1]}月${parts[2]}日`;
  return time === undefined ? label : `${label} ${time}`;
}

/** 「还剩 N 天」——按日历天（当天 0 天）。 */
export function daysUntilKeyDate(at: string, now: string): number {
  const day = at.slice(0, 10);
  const base = now.slice(0, 10);
  return Math.round((Date.parse(`${day}T00:00:00`) - Date.parse(`${base}T00:00:00`)) / 86_400_000);
}
