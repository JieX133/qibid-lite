// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

export interface ScoringTotalItem {
  id: string;
  item: string;
  maxScore: number;
}

export type ScoringTotalResult =
  | { ok: true; sum: number; diffs: string[] }
  | { ok: false; sum: number; diffs: string[] };

export function inferDeclaredTotal(text: string, itemMaxScores: readonly number[] = []): number | undefined {
  // 评分细则里的「满分 N 分」是单项上限，不是总分：传入评分项分值后，凡不大于最大单项分的候选都剔除。
  const itemMax = itemMaxScores.length > 0 ? Math.max(...itemMaxScores) : undefined;
  const zongfen: number[] = [];
  const manfen: number[] = [];
  for (const match of text.matchAll(/(总分|满分)\s*[：:为]?\s*(\d+(?:\.\d+)?)\s*分?/g)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (itemMax !== undefined && value <= itemMax) continue;
    (match[1] === "总分" ? zongfen : manfen).push(value);
  }
  // 「技术部分满分57分」这类小计不能盖过「满分100分」：同类候选取最大者。
  if (zongfen.length > 0) return Math.max(...zongfen);
  if (manfen.length > 0) return Math.max(...manfen);
  return undefined;
}

export function inferScoringRowCount(text: string): number | undefined {
  const rows = text.split(/\r?\n/).filter((line) => /^\s*\d+[\.、．]/.test(line) && /分/.test(line));
  return rows.length >= 2 ? rows.length : undefined;
}

export function validateScoringTotals(input: {
  items: readonly ScoringTotalItem[];
  declaredTotal?: number;
  sourceRowCount?: number;
}): ScoringTotalResult {
  const sum = input.items.reduce((total, item) => total + item.maxScore, 0);
  const diffs: string[] = [];
  if (input.items.length === 0) return { ok: true, sum: 0, diffs: [] };
  if (input.declaredTotal !== undefined && Math.abs(sum - input.declaredTotal) > 0.001) {
    diffs.push(`分值合计 ${sum} 不等于总分 ${input.declaredTotal}`);
    const listed = input.items.map((item) => `${item.item}=${item.maxScore}`).join("，");
    if (listed !== "") diffs.push(`已解析项：${listed}`);
  }
  if (input.sourceRowCount !== undefined && input.items.length !== input.sourceRowCount) {
    diffs.push(`评分项数 ${input.items.length} 不等于原文行数 ${input.sourceRowCount}`);
  }
  if (diffs.length > 0) return { ok: false, sum, diffs };
  return { ok: true, sum, diffs: [] };
}

/**
 * spec change 2026-10-16（M1 F1b）：分值合计/行数不一致不再拦写作——真实招标文件常有不完整评分表，
 * 硬拦会把「写标书」打成死路。改为返回用户可读提醒；调用方照常写，把提醒透传到回执和「标书」页。
 */
export function scoringMismatchWarnings(
  items: readonly ScoringTotalItem[],
  opts: { declaredTotal?: number; sourceRowCount?: number } = {},
): string[] {
  const sum = items.reduce((total, item) => total + item.maxScore, 0);
  const warnings: string[] = [];
  if (items.length === 0) return warnings;
  if (opts.declaredTotal !== undefined && Math.abs(sum - opts.declaredTotal) > 0.001) {
    warnings.push(`评分表合计 ${sum} 分，招标文件写明总分 ${opts.declaredTotal} 分，可能漏抽了评分项，请到「招标文件」核对评分办法`);
  }
  if (opts.sourceRowCount !== undefined && items.length !== opts.sourceRowCount) {
    warnings.push(`评分表只有 ${items.length} 项，原文评分办法有 ${opts.sourceRowCount} 行，可能漏抽了评分项，请到「招标文件」核对评分办法`);
  }
  return warnings;
}
