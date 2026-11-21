// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

export const DISQUALIFY_PACKS = ["common", "goods", "services", "works"] as const;
export type DisqualifyPack = (typeof DISQUALIFY_PACKS)[number];

export const DISQUALIFY_AREAS = [
  "签署盖章",
  "资格",
  "保证金",
  "报价",
  "实质性响应",
  "格式份数",
  "有效期",
  "诚信",
  "电子投标",
  "货物",
  "服务",
  "工程",
] as const;
export type DisqualifyArea = (typeof DISQUALIFY_AREAS)[number];

export interface DisqualifyRule {
  id: string;
  pack: DisqualifyPack;
  area: DisqualifyArea;
  /** 与 playbook REJECTION_CHECKLIST 对齐的旧 id，仅 common 有。 */
  legacyId?: string;
  title: string;
  /** 用于在招标原文中定位该条废标/无效情形。 */
  trigger: string;
  check: string;
  fix: string;
  law: string;
  auto: boolean;
}

export interface DisqualifyLocator {
  relPath: string;
  page?: number;
  paragraph: number;
  excerpt: string;
}

export interface DisqualifyHit {
  ruleId: string;
  pack: DisqualifyPack;
  area: DisqualifyArea;
  title: string;
  locator: DisqualifyLocator;
  fix: string;
  law: string;
}

export interface DisqualifySource {
  relPath: string;
  text: string;
  page?: number;
}
