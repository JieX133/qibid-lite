// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
};

export function chineseToInt(raw: string): number | null {
  const s = raw.replace(/整/g, "").trim();
  if (s === "") return null;
  let result = 0;
  let section = 0;
  let number = 0;
  for (const ch of s) {
    if (CN_DIGITS[ch] !== undefined) {
      number = CN_DIGITS[ch];
      continue;
    }
    if (ch === "十" || ch === "拾") {
      section += (number || 1) * 10;
      number = 0;
      continue;
    }
    if (ch === "百" || ch === "佰") {
      section += number * 100;
      number = 0;
      continue;
    }
    if (ch === "千" || ch === "仟") {
      section += number * 1000;
      number = 0;
      continue;
    }
    if (ch === "万") {
      section += number;
      result += section * 10_000;
      section = 0;
      number = 0;
      continue;
    }
    if (ch === "亿") {
      section += number;
      result = (result + section) * 100_000_000;
      section = 0;
      number = 0;
      continue;
    }
    return null;
  }
  return result + section + number;
}

function parseArabic(raw: string): number | null {
  const n = Number(raw.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeAmountWan(text: string): number | null {
  if (text.trim() === "") return null;
  // A signed Arabic duplicate includes cents that the upper-case 万 fragment omits.
  const signed = /[¥￥]\s*([\d,]+(?:\.\d+)?)/.exec(text);
  if (signed !== null) {
    const value = Number(signed[1]!.replaceAll(",", ""));
    const tail = text.slice(signed.index + signed[0].length);
    return /^\s*[（(]?\s*万/.test(tail) ? value : value / 10_000;
  }
  const hits: Array<{ index: number; value: number; unit: "wan" | "yuan" | "bare" }> = [];
  const push = (index: number, value: number | null, unit: "wan" | "yuan" | "bare") => {
    if (value !== null && Number.isFinite(value)) hits.push({ index, value, unit });
  };
  for (const match of text.matchAll(/([零〇一二三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟两]+)万元?整?/g)) {
    const token = match[1] ?? "";
    const n = chineseToInt(token);
    push(match.index ?? 0, n === null ? null : token.includes("万") ? n / 10_000 : n, "wan");
  }
  for (const match of text.matchAll(/[¥￥]?\s*([\d,]+(?:\.\d+)?)/g)) {
    const n = parseArabic(match[1] ?? "");
    if (n === null) continue;
    const start = match.index ?? 0;
    const after = text.slice(start + match[0].length, start + match[0].length + 12);
    const hasWan = /^\s*[（(]?\s*万/.test(after);
    const hasYuan = /^\s*元/.test(after);
    const hasSign = /[¥￥]/.test(match[0]);
    if (hasWan) push(start, n, "wan");
    else if (hasYuan || hasSign) push(start, n / 10_000, "yuan");
    else push(start, n, "bare");
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.index - b.index);
  const unitHit = hits.find((item) => item.unit !== "bare");
  return (unitHit ?? hits[0])?.value ?? null;
}

export function amountFromSnippet(snippet: string, unlabeledAsYuanFrom = 10_000): number | null {
  const trimmed = snippet.replace(/[\s\u00a0\u3000]+/g, " ").trim();
  if (/^(?:无|\/|—|－|-|如有)?\s*$/.test(trimmed)) return null;
  const numbers = [...trimmed.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((item) => parseArabic(item[1] ?? ""));
  const valid = numbers.filter((n): n is number => n !== null);
  if (valid.length > 1 && /[,，]/.test(trimmed.replace(/[\d.]+/g, ""))) return null;
  if (/（元）|\(元\)/.test(trimmed) && valid[0] !== undefined) return valid[0] / 10_000;
  if (/万|元|[¥￥]/.test(trimmed)) {
    const unitHit = normalizeAmountWan(trimmed);
    if (unitHit !== null) return unitHit;
  }
  const n = valid[0];
  if (n === undefined) return normalizeAmountWan(trimmed);
  if (n >= unlabeledAsYuanFrom) return n / 10_000;
  return n;
}


function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeDateTime(text: string): string | null {
  const ranked = collectDateTimes(text);
  return ranked[0]?.value ?? null;
}

export interface DateTimeHit {
  index: number;
  value: string;
  hasTime: boolean;
  raw: string;
}

export function collectDateTimes(text: string): DateTimeHit[] {
  const hits: DateTimeHit[] = [];
  const push = (index: number, raw: string, year: string, month: string, day: string, apm?: string, hour?: string, minute?: string) => {
    let shifted = hour;
    if (apm !== undefined && hour !== undefined) {
      const n = Number(hour);
      if (/下午|晚上|傍晚/.test(apm) && n < 12) shifted = String(n + 12);
    }
    const hasTime = shifted !== undefined && minute !== undefined;
    const value = `${year}-${pad2(Number(month))}-${pad2(Number(day))}T${hasTime ? `${pad2(Number(shifted))}:${pad2(Number(minute))}` : "23:59"}`;
    hits.push({ index, value, hasTime, raw });
  };
  // 上午/下午/晚上/中午 贴在「日」与「时」之间：2026年10月20日下午5:00 → 17:00。
  for (const match of text.matchAll(/(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})(?:\s*日)?(?:\s*(上午|下午|中午|晚上|凌晨|早上|傍晚)?\s*(\d{1,2})\s*[时点:：]\s*(\d{1,2})(?:\s*分)?(?:\s*\d{0,2}\s*秒)?)?/g)) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    push(match.index ?? 0, match[0] ?? "", match[1] ?? "", match[2] ?? "", match[3] ?? "", match[4], match[5], match[6]);
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}
