// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 日历日解析与本地切日的唯一实现（ARCH-I1：终止 filters/postFilter/tianyancha/profile 四处分叉）。
 * 纯函数、零 IO；所有日期字符串统一归一为 `YYYY-MM-DD`。
 */

/** 把 `Date` 按本地日历日格式化为 `YYYY-MM-DD`（不能按 UTC 切日，否则东八区 00:00–07:59 整体差一天）。 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 从 `now` 按本地日历日偏移 `deltaDays` 天（负数向过去偏移）。 */
export function shiftLocalDays(now: Date, deltaDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + deltaDays);
  return localDateKey(d);
}

/** 严格日历校验：用 Date 往返拒掉 `2026-02-31`、`2026-04-31` 等不存在的日期。 */
export function formatValidYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 把常见发布日期写法统一解析为 `YYYY-MM-DD`；无法识别或非法日历日返回 `null`。
 * 支持：
 * - `2023-5-1`、`2023-05-01`、`2023-05-01T12:00:00Z`、`2023-05-01 08:30:00`
 * - `2023/5/1`、`2023.05.01`、`2023年5月1日`
 * - `20230501`
 * - 10 位秒级 / 13 位毫秒级 Unix 时间戳（数字或纯数字串）
 */
export function parseCalendarDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : localDateKey(raw);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw >= 1e12 && raw < 1e14) return localDateKey(new Date(raw));
    if (raw >= 1e9 && raw < 1e11) return localDateKey(new Date(raw * 1000));
    return null;
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text === "") return null;

  // 纯数字：8 位 YYYYMMDD 或 10/13 位时间戳
  if (/^\d{8}$/.test(text)) {
    return formatValidYmd(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8)));
  }
  if (/^\d{10}$/.test(text)) {
    const ms = Number(text) * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : localDateKey(d);
  }
  if (/^\d{13}$/.test(text)) {
    const ms = Number(text);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : localDateKey(d);
  }

  // 分隔符写法：统一支持 `-` / `/` / `.` / `年-月-日`（允许单位月日，如 `2023-5-1`）
  const sep = text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:\b|[^\d]|$)/);
  if (sep !== null) {
    return formatValidYmd(Number(sep[1]), Number(sep[2]), Number(sep[3]));
  }
  return null;
}
