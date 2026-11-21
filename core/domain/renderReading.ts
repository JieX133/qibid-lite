// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import { TENDER_FACT_FIELDS, type TenderFactField, type TenderFacts } from "./tenderFacts.ts";
import { visibleRuntimeNotice } from "./visibleNotice.ts";

const SECTION_ORDER: Array<{ title: string; field: TenderFactField }> = [
  { title: "资格要求", field: "qualifications" },
  { title: "评分办法", field: "scoring" },
  { title: "废标条款", field: "rejectionClauses" },
  { title: "递交截止", field: "deadline" },
  { title: "保证金", field: "depositWan" },
  { title: "技术要点", field: "technicalKeyPoints" },
  { title: "投标文件组成", field: "proposalStructure" },
];

function asText(facts: TenderFacts, field: TenderFactField): string {
  const value = facts[field];
  if (value === null || value === undefined) return "（缺）";
  if (typeof value === "string") return value.trim() === "" ? "（缺）" : value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "（缺）";
    if (typeof value[0] === "string") return value.map((item, index) => `${index + 1}. ${item}`).join("\n");
    if (field === "qualifications") {
      return facts.qualifications.map((item) => `- [${item.hard ? "硬性" : "一般"}/${item.category}] ${item.text}`).join("\n");
    }
    if (field === "scoring") {
      return facts.scoring.map((item) => `- ${item.part} · ${item.item} · ${item.maxScore} 分 · ${item.basis}`).join("\n");
    }
    if (field === "rejectionClauses") {
      return facts.rejectionClauses.map((item) => `- ${item.text}`).join("\n");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function sourceCell(facts: TenderFacts, field: TenderFactField): string {
  const where = field === "qualifications" ? facts.qualifications[0]?.where
    : field === "scoring" ? facts.scoring[0]?.where
      : field === "rejectionClauses" ? facts.rejectionClauses[0]?.where
        : facts.sourceFiles[0];
  if (where && "relPath" in where) {
    const page = "page" in where && typeof where.page === "number" ? `:${where.page}` : "";
    return `${where.relPath}${page}`;
  }
  const file = facts.sourceFiles[0];
  if (file === undefined) return "—";
  const page = file.visionPages?.[0] !== undefined ? `:${file.visionPages[0]}` : "";
  return `${file.relPath}${page}`;
}

export function renderReading(facts: TenderFacts): string {
  const overview = [
    `# 看标事实`,
    "",
    `项目：${facts.projectName || "（缺）"}　编号：${facts.projectNo || "（缺）"}`,
    `采购人：${facts.buyer || "（缺）"}${facts.confidence.buyer === "user" ? "（手填）" : ""}　代理：${facts.agency || "（缺）"}`,
    `预算：${facts.budgetWan ?? "（缺）"}${facts.confidence.budgetWan === "user" ? "（手填）" : ""} 万元　限价：${facts.ceilingWan ?? "（缺）"} 万元`,
    `开标：${facts.openAt ?? "（缺）"}　地点：${facts.openPlace || "（缺）"}`,
  ];
  const sections = SECTION_ORDER.map((section) => `## ${section.title}\n\n${asText(facts, section.field)}\n`);
  const rows = TENDER_FACT_FIELDS.map((field) => {
    const value = asText(facts, field).replaceAll("\n", " / ").slice(0, 120);
    return `| ${field} | ${value} | ${facts.confidence[field] === "user" ? "手填" : facts.confidence[field]} | ${sourceCell(facts, field)} |`;
  });
  const notes = facts.notes.length > 0
    ? `\n说明：${facts.notes.map((note) => visibleRuntimeNotice(note)).join("；")}\n`
    : "";
  return [
    ...overview,
    "",
    ...sections,
    "## 事实来源",
    "",
    "| 字段 | 值 | confidence | 文件:页 |",
    "|---|---|---|---|",
    ...rows,
    notes,
  ].join("\n");
}
