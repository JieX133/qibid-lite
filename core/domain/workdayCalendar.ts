// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 014 J-1 工作日日历：国务院办公厅每年公布的放假调休安排，随产品更新。
 * 表里没有的年份只扣周末，结果带 verified=false，界面标「待核」。
 * 日期一律按北京时间的日历日 "YYYY-MM-DD" 计算，不经过本机时区。
 */

interface YearPlan {
  /** 放假日（含落在周末的放假日），闭区间。 */
  off: ReadonlyArray<readonly [string, string]>;
  /** 调休上班日（周末上班）。 */
  work: readonly string[];
  /** 出处：发文字号与发布日期。 */
  source: string;
}

export const OFFICIAL_HOLIDAYS: Readonly<Record<number, YearPlan>> = {
  2025: {
    source: "国办发明电〔2024〕12号，2024-11-12",
    off: [["2025-01-01", "2025-01-01"], ["2025-01-28", "2025-02-04"], ["2025-04-04", "2025-04-06"], ["2025-05-01", "2025-05-05"], ["2025-05-31", "2025-06-02"], ["2025-10-01", "2025-10-08"]],
    work: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  },
  2026: {
    source: "国办发明电〔2025〕7号，2025-11-04",
    off: [["2026-01-01", "2026-01-03"], ["2026-02-15", "2026-02-23"], ["2026-04-04", "2026-04-06"], ["2026-05-01", "2026-05-05"], ["2026-06-19", "2026-06-21"], ["2026-09-25", "2026-09-27"], ["2026-10-01", "2026-10-07"]],
    work: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
  },
  2027: {
    source: "国办发明电〔2026〕10号，2026-11-05",
    off: [["2027-01-01", "2027-01-03"], ["2027-02-05", "2027-02-13"], ["2027-04-03", "2027-04-05"], ["2027-05-01", "2027-05-05"], ["2027-06-09", "2027-06-09"], ["2027-09-15", "2027-09-15"], ["2027-10-01", "2027-10-07"]],
    work: ["2027-01-31", "2027-02-14", "2027-05-08", "2027-09-26", "2027-10-09"],
  },
};

const DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(date: string): number {
  const m = DATE_RE.exec(date);
  if (m === null) throw new Error(`日期格式应为 YYYY-MM-DD：${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 任意时间串 → 北京时间日历日。带时区的 ISO 按 +08:00 折算；纯日期原样返回。 */
export function chinaDate(value: string): string {
  if (DATE_RE.test(value)) return value;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`读不出日期：${value}`);
  return fromUtc(ms + 8 * 3_600_000);
}

export function isWorkday(date: string): { workday: boolean; verified: boolean } {
  const ms = toUtc(date);
  const plan = OFFICIAL_HOLIDAYS[Number(date.slice(0, 4))];
  const weekday = new Date(ms).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  if (plan === undefined) return { workday: !weekend, verified: false };
  if (plan.work.includes(date)) return { workday: true, verified: true };
  const off = plan.off.some(([from, to]) => ms >= toUtc(from) && ms <= toUtc(to));
  return { workday: !off && !weekend, verified: true };
}

/** 从 start 的次日起数 n 个工作日，返回第 n 个工作日（法定「×个工作日内」的末日）。 */
export function addWorkdays(start: string, n: number): { date: string; verified: boolean } {
  if (!Number.isInteger(n) || n < 1) throw new Error(`工作日数应为正整数：${n}`);
  let ms = toUtc(start);
  let left = n;
  let verified = true;
  while (left > 0) {
    ms += DAY;
    const day = isWorkday(fromUtc(ms));
    verified &&= day.verified;
    if (day.workday) left -= 1;
  }
  return { date: fromUtc(ms), verified };
}

/** (from, to] 之间的工作日数：from 当天不算，to 当天算。to 早于 from 时为 0。 */
export function workdaysBetween(from: string, to: string): { count: number; verified: boolean } {
  let ms = toUtc(from);
  const end = toUtc(to);
  let count = 0;
  let verified = true;
  while (ms < end) {
    ms += DAY;
    const day = isWorkday(fromUtc(ms));
    verified &&= day.verified;
    if (day.workday) count += 1;
  }
  return { count, verified };
}
