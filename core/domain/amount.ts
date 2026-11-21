// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import type { ProjectRow } from "./types.ts";

/** 缺测或 0 不当真钱。 */
export function knownAmountWan(row: Pick<ProjectRow, "awardWan" | "budgetWan">): number | null {
  const award = row.awardWan;
  if (typeof award === "number" && Number.isFinite(award) && award > 0) return award;
  const budget = row.budgetWan;
  if (typeof budget === "number" && Number.isFinite(budget) && budget > 0) return budget;
  return null;
}

export function formatKnownAmount(wan: number | null): string {
  return wan === null ? "金额未知" : `${wan}万`;
}

export function formatCardAmount(card: { amountWan: number | null; amountKind?: "award" | "budget" }): string {
  if (card.amountWan === null || !(card.amountWan > 0)) return "金额未知";
  if (card.amountKind === "award") return `中标价 ${card.amountWan}万`;
  if (card.amountKind === "budget") return `预算 ${card.amountWan}万`;
  return `金额 ${card.amountWan}万`;
}
