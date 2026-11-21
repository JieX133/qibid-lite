// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import { z } from "zod";

/**
 * 010 · 招标文件事实（看标产物，落盘 `看标/facts.json`）。
 *
 * 两层生产：`docExtract` + 正则/章节切分先填确定性字段（confidence=regex），
 * 模型（文本或多模态图页）只补 `missing` 字段（confidence=model）。
 * `reading.md` 由本结构渲染，禁止反向从 markdown 解析。
 */

export const TENDER_SOURCE_KINDS = ["pdf-text", "pdf-scan", "docx", "xlsx", "txt", "image", "unsupported"] as const;
export type TenderSourceKind = (typeof TENDER_SOURCE_KINDS)[number];

export const FACT_CONFIDENCE = ["regex", "model", "user", "missing"] as const;
export type FactConfidence = (typeof FACT_CONFIDENCE)[number];
export const FACT_CONFIDENCE_LABEL: Record<FactConfidence, string> = {
  regex: "正则",
  model: "模型",
  user: "手填",
  missing: "缺",
};

/** 用户在新建项目或看标页写下的值。重新看标不得覆盖。 */
export function seedHandfilledFacts(
  facts: TenderFacts,
  input: { buyer?: string; budgetWan?: number | null },
): TenderFacts {
  const next = { ...facts, confidence: { ...facts.confidence } };
  const buyer = input.buyer?.trim() ?? "";
  if (buyer !== "") {
    next.buyer = buyer;
    next.confidence.buyer = "user";
  }
  if (typeof input.budgetWan === "number" && Number.isFinite(input.budgetWan) && input.budgetWan > 0) {
    next.budgetWan = input.budgetWan;
    next.confidence.budgetWan = "user";
  }
  return next;
}

/** 页码/文件定位，供审标 ref 与 UI 跳转。 */
export const factLocatorSchema = z.object({
  relPath: z.string(),
  page: z.number().int().positive().optional(),
  quote: z.string().max(400).optional(),
});
export type FactLocator = z.infer<typeof factLocatorSchema>;

export const qualificationSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  /** 硬性条款（不满足即否决）。 */
  hard: z.boolean(),
  /** 归类，供资质匹配用：certificate 证书 / performance 业绩 / staff 人员 / finance 财务 / legal 法定 / other。 */
  category: z.enum(["certificate", "performance", "staff", "finance", "legal", "other"]),
  where: factLocatorSchema.optional(),
});
export type Qualification = z.infer<typeof qualificationSchema>;

export const scoringItemSchema = z.object({
  id: z.string(),
  /** 商务 / 技术 / 价格 / 其他。 */
  part: z.enum(["商务", "技术", "价格", "其他"]),
  item: z.string().min(1),
  maxScore: z.number().nonnegative(),
  basis: z.string(),
  where: factLocatorSchema.optional(),
});
export type ScoringItem = z.infer<typeof scoringItemSchema>;

export const rejectionClauseSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  where: factLocatorSchema.optional(),
});
export type RejectionClause = z.infer<typeof rejectionClauseSchema>;

export const sourceFileSchema = z.object({
  relPath: z.string(),
  kind: z.enum(TENDER_SOURCE_KINDS),
  /** 抽出的正文字数；扫描件/图片为 0。 */
  chars: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative().optional(),
  /** 扫描页已渲染为 PNG 交给多模态模型的页码。 */
  visionPages: z.array(z.number().int().positive()).optional(),
  sha256: z.string().optional(),
});
export type TenderSourceFile = z.infer<typeof sourceFileSchema>;

export const TENDER_FACT_FIELDS = [
  "projectName",
  "projectNo",
  "buyer",
  "agency",
  "budgetWan",
  "ceilingWan",
  "deadline",
  "openAt",
  "openPlace",
  "depositWan",
  "depositForms",
  "qualifications",
  "scoring",
  "rejectionClauses",
  "technicalKeyPoints",
  "proposalStructure",
  "serviceTerm",
  "contacts",
] as const;
export type TenderFactField = (typeof TENDER_FACT_FIELDS)[number];

export const tenderFactsSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string(),
  extractedAt: z.string(),
  projectName: z.string(),
  projectNo: z.string(),
  buyer: z.string(),
  agency: z.string(),
  /** 预算，万元。null = 文件未写。 */
  budgetWan: z.number().nullable(),
  /** 最高限价 / 控制价，万元。 */
  ceilingWan: z.number().nullable(),
  /** 递交截止，ISO 本地时间 `YYYY-MM-DDTHH:mm`。 */
  deadline: z.string().nullable(),
  openAt: z.string().nullable(),
  /** J-1 关键日程（获取截止/提疑截止/保证金到账/踏勘/解密规则）。可选：旧 facts.json 没有它。 */
  keyDates: z.array(z.object({
    kind: z.enum(["docObtainEnd", "clarifyEnd", "depositArrive", "siteVisit", "submitEnd", "openAt", "decrypt"]),
    label: z.string(),
    at: z.string().nullable(),
    rule: z.string().optional(),
    offsetMinutes: z.number().int().optional(),
    quote: z.string(),
    hard: z.boolean(),
  })).optional(),
  /** J-3 递交方式与平台操作：在哪投、用什么客户端、要不要 CA/解密。可选：旧 facts.json 没有它。 */
  submissionRoute: z.object({
    mode: z.enum(["online", "offline", "mixed"]).nullable(),
    platform: z.string().nullable(),
    platformUrl: z.string().nullable(),
    clientTool: z.string().nullable(),
    eSign: z.boolean().nullable(),
    decryptRule: z.string().nullable(),
    remoteOpening: z.boolean().nullable(),
    uploadLimits: z.string().nullable(),
    quotes: z.record(z.string(), z.string()).default({}),
  }).nullable().optional(),
  /** K-3 法规体系与公告期限：判定质疑/异议窗口用。可选：旧 facts.json 没有它们。 */
  legalRegime: z.enum(["政府采购", "依法必须招标", "其他"]).optional(),
  procurementMethod: z.string().nullable().optional(),
  /** 公告期限：自本公告发布之日起 N 个工作日（公告写明时）。 */
  noticePeriodWorkdays: z.number().int().positive().nullable().optional(),
  /** 公告发布日 "YYYY-MM-DD"（或带时刻）。 */
  publishedAt: z.string().nullable().optional(),
  /** 015 C1 多标段/多包组明细（可选：单包项目或旧 facts.json 不含此字段）。 */
  lots: z.array(z.object({
    id: z.string(),
    name: z.string(),
    budgetWan: z.number().nullable(),
    ceilingWan: z.number().nullable(),
    scope: z.string(),
    specificQualifications: z.array(z.string()).default([]),
  })).optional(),
  lotPolicy: z.object({
    allowMultiBid: z.boolean(),
    maxWinLots: z.number().int().positive().nullable(),
    awardOrder: z.string().nullable(),
    distinctProjectManagerRequired: z.boolean(),
  }).optional(),
  openPlace: z.string(),
  depositWan: z.number().nullable(),
  depositForms: z.array(z.string()),
  qualifications: z.array(qualificationSchema),
  scoring: z.array(scoringItemSchema),
  rejectionClauses: z.array(rejectionClauseSchema),
  technicalKeyPoints: z.array(z.string()),
  /** 招标文件要求的投标文件组成（章节清单）。做标书按此出章节。 */
  proposalStructure: z.array(z.string()),
  serviceTerm: z.string(),
  contacts: z.array(z.string()),
  sourceFiles: z.array(sourceFileSchema),
  confidence: z.record(z.enum(TENDER_FACT_FIELDS), z.enum(FACT_CONFIDENCE)),
  /** 人类可读的抽取说明（扫描页数、未支持文件等），不是 notice 兜底。 */
  notes: z.array(z.string()),
});
export type TenderFacts = z.infer<typeof tenderFactsSchema>;

export const FACTS_REL = "看标/facts.json";
export const READING_REL_010 = "看标/reading.md";

export function emptyTenderFacts(projectId: string, extractedAt = new Date().toISOString()): TenderFacts {
  const confidence = Object.fromEntries(TENDER_FACT_FIELDS.map((field) => [field, "missing"])) as Record<TenderFactField, FactConfidence>;
  return {
    schemaVersion: 1,
    projectId,
    extractedAt,
    projectName: "",
    projectNo: "",
    buyer: "",
    agency: "",
    budgetWan: null,
    ceilingWan: null,
    deadline: null,
    openAt: null,
    openPlace: "",
    depositWan: null,
    depositForms: [],
    qualifications: [],
    scoring: [],
    rejectionClauses: [],
    technicalKeyPoints: [],
    proposalStructure: [],
    serviceTerm: "",
    contacts: [],
    sourceFiles: [],
    confidence,
    notes: [],
  };
}

/** 尚未取得的字段名（供分析层写「缺 N 项：…」与看标按钮的补全动作）。 */
export function missingFactFields(facts: TenderFacts): TenderFactField[] {
  return TENDER_FACT_FIELDS.filter((field) => facts.confidence[field] === "missing");
}

/** 判标最少需要的字段；缺任一项时分析层只能输出「缺什么 + 去哪取」。 */
export const JUDGE_REQUIRED_FIELDS: readonly TenderFactField[] = ["deadline", "qualifications"];

export function parseTenderFacts(raw: unknown): TenderFacts | undefined {
  const parsed = tenderFactsSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
