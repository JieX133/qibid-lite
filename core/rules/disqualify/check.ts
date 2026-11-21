// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import { COMMON_DISQUALIFY_RULES } from "./common.ts";
import { GOODS_DISQUALIFY_RULES } from "./goods.ts";
import { SERVICES_DISQUALIFY_RULES } from "./services.ts";
import { WORKS_DISQUALIFY_RULES } from "./works.ts";
import {
  DISQUALIFY_AREAS,
  DISQUALIFY_PACKS,
  type DisqualifyHit,
  type DisqualifyLocator,
  type DisqualifyPack,
  type DisqualifyRule,
  type DisqualifySource,
} from "./types.ts";

export const DISQUALIFY_RULES: readonly DisqualifyRule[] = [
  ...COMMON_DISQUALIFY_RULES,
  ...GOODS_DISQUALIFY_RULES,
  ...SERVICES_DISQUALIFY_RULES,
  ...WORKS_DISQUALIFY_RULES,
];

const PACK_RULES: Record<DisqualifyPack, readonly DisqualifyRule[]> = {
  common: COMMON_DISQUALIFY_RULES,
  goods: GOODS_DISQUALIFY_RULES,
  services: SERVICES_DISQUALIFY_RULES,
  works: WORKS_DISQUALIFY_RULES,
};

export function rulesFor(packs: readonly DisqualifyPack[]): DisqualifyRule[] {
  const wanted = new Set(packs);
  return DISQUALIFY_RULES.filter((rule) => wanted.has(rule.pack));
}

export function findRule(id: string): DisqualifyRule | undefined {
  return DISQUALIFY_RULES.find((rule) => rule.id === id || rule.legacyId === id);
}

export function validateDisqualifyLibrary(rules: readonly DisqualifyRule[] = DISQUALIFY_RULES): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!/^DQ-[CGSW]-[a-z0-9-]+$/.test(rule.id)) errors.push(`${rule.id}：id 不符合 DQ-C/G/S/W-*`);
    if (!DISQUALIFY_PACKS.includes(rule.pack)) errors.push(`${rule.id}：未知 pack`);
    if (!DISQUALIFY_AREAS.includes(rule.area)) errors.push(`${rule.id}：未知 area`);
    if (rule.title.trim().length < 2) errors.push(`${rule.id}：缺 title`);
    if (rule.trigger.trim().length < 2) errors.push(`${rule.id}：缺 trigger`);
    if (rule.check.trim().length < 8) errors.push(`${rule.id}：缺 check`);
    if (rule.fix.trim().length < 8) errors.push(`${rule.id}：缺整改模板`);
    if (rule.law.trim().length < 2) errors.push(`${rule.id}：缺法规来源`);
    if (ids.has(rule.id)) errors.push(`${rule.id}：id 重复`);
    ids.add(rule.id);
    try {
      new RegExp(rule.trigger);
    } catch {
      errors.push(`${rule.id}：trigger 不是合法正则`);
    }
  }
  for (const pack of ["goods", "services", "works"] as const) {
    if (PACK_RULES[pack].length === 0) errors.push(`${pack} 规则库为空`);
  }
  return errors;
}

function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function locate(source: DisqualifySource, trigger: RegExp): DisqualifyLocator | undefined {
  const paragraphs = paragraphsOf(source.text);
  for (let i = 0; i < paragraphs.length; i += 1) {
    const excerpt = paragraphs[i]!;
    if (!trigger.test(excerpt)) continue;
    return {
      relPath: source.relPath,
      ...(source.page === undefined ? {} : { page: source.page }),
      paragraph: i + 1,
      excerpt: excerpt.slice(0, 200),
    };
  }
  const joined = source.text.replace(/\s+/g, "");
  if (!trigger.test(joined) && !trigger.test(source.text)) return undefined;
  return {
    relPath: source.relPath,
    ...(source.page === undefined ? {} : { page: source.page }),
    paragraph: 1,
    excerpt: source.text.replace(/\s+/g, " ").trim().slice(0, 200),
  };
}

export function checkDisqualify(input: {
  packs?: readonly DisqualifyPack[];
  sources: readonly DisqualifySource[];
}): DisqualifyHit[] {
  const packs = input.packs ?? [...DISQUALIFY_PACKS];
  const hits: DisqualifyHit[] = [];
  for (const rule of rulesFor(packs)) {
    const trigger = new RegExp(rule.trigger);
    for (const source of input.sources) {
      const locator = locate(source, trigger);
      if (locator === undefined) continue;
      hits.push({
        ruleId: rule.id,
        pack: rule.pack,
        area: rule.area,
        title: rule.title,
        locator,
        fix: rule.fix,
        law: rule.law,
      });
      break;
    }
  }
  return hits;
}
