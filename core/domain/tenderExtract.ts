// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import { extractKeyDates } from "./keyDates.ts";
import { extractSubmissionRoute } from "./submissionRoute.ts";
import { extractRegimeSignals } from "./challengeRegime.ts";
import { quoteQualifications, quoteSoftFields } from "./noticeQuotes.ts";
import { amountFromSnippet, collectDateTimes, normalizeAmountWan, normalizeDateTime, type DateTimeHit } from "./tenderValues.ts";
export { chineseToInt, normalizeAmountWan, normalizeDateTime } from "./tenderValues.ts";
import { scoringFromTableText } from "./scoringExtract.ts";
import { inferDeclaredTotal } from "./scoringValidate.ts";
import {
  emptyTenderFacts,
  type FactConfidence,
  type FactLocator,
  type Qualification,
  type RejectionClause,
  type ScoringItem,
  type TenderFactField,
  type TenderFacts,
  type TenderSourceFile,
  TENDER_FACT_FIELDS,
} from "./tenderFacts.ts";

export interface TenderSection {
  heading: string;
  body: string;
  page?: number;
  /** 本节正文的实际来源文件（多文件看标逐文件切分时回填）。 */
  relPath?: string;
}

const TOC_LINE = /[.…·．]{2,}\s*\d+\s*$/;
const CHAPTER_HEADING = /^(第[一二三四五六七八九十百0-9]+[章节部分](?:\s+\S.*)?)$/;
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)\s+\S/;
const CN_ENUM_HEADING = /^[一二三四五六七八九十]+、\S/;
const CN_PAREN_HEADING = /^（[一二三四五六七八九十]+）/;
const NAMED_HEADING = /^(目\s*录|资格要求|资格条件|投标人资格|申请人的资格.*|评标办法|评分办法|废标条款|技术要求|技术规格|服务要求|投标文件格式|投标文件组成|投标文件的组成|招标公告|投标人须知)$/;
const QUAL_HEADING = /资格要求|资格条件|投标人资格|申请人的资格/;
const AMOUNT_NEAR = 40;

function nextNonEmptyLine(text: string, from: number): string {
  for (const line of text.slice(from).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}

function labeledAmount(text: string, label: RegExp, unlabeledAsYuanFrom = 10_000): number | null {
  const flags = label.flags.includes("g") ? label.flags : `${label.flags}g`;
  const re = new RegExp(`(?:${label.source})[：:=\\s|]*([^\\n|\\t]{0,80})`, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    let captured = match[1] ?? "";
    if (captured.trim() === "" || isBareFieldLabel(captured.trim())) {
      captured = nextNonEmptyLine(text, (match.index ?? 0) + (match[0] ?? "").length);
    }
    const prefix = (match[0] ?? "").slice(0, Math.max(0, (match[0] ?? "").length - (match[1] ?? "").length));
    // A reference to a budget/ceiling in a clause is not the field's declared value.
    if (/^(?:或|的|已|单价|总价的|\d+(?:\.\d+)?\s*%)/.test(captured.trim())) continue;
    const snippet = `${prefix}${cutAtFieldBoundary(captured)}`;
    const parsed = amountFromSnippet(snippet, unlabeledAsYuanFrom);
    if (parsed !== null) return parsed;
  }
  return null;
}


function contextAround(text: string, index: number, span: number, radius = 110): { before: string; after: string; window: string } {
  const before = text.slice(Math.max(0, index - radius), index);
  const after = text.slice(index, Math.min(text.length, index + span + radius));
  return { before, after, window: `${before}${after}` };
}

function dateNoiseScore(before: string, after: string): number {
  const around = `${before}${after}`;
  let score = 0;
  if (/变更为|更正后|调整为/.test(before)) score += 10;
  if (/变更为|更正后/.test(after) && /原(?:投标)?截止|原开标/.test(before)) score -= 14;
  else if (/原(?:投标)?截止|首次公告|原开标/.test(before)) score -= 12;
  if (/发布日期|发布时间|公告时间|更正日期|首次公告日期/.test(before)) score -= 10;
  if (/获取招标文件时间|发售时间[：:]/.test(before)) score -= 8;
  if (/售价[：:]/.test(before) && /截止|开标/.test(before) === false) score -= 4;
  if (/每天上午/.test(around) && /至/.test(around) && !/并于/.test(around)) score -= 8;
  if (/提问|答疑|澄清|到账/.test(around) && !/截止时间|开标时间/.test(around)) score -= 6;
  return score;
}

function pickDateTime(text: string, kind: "deadline" | "open"): string | null {
  const hits = collectDateTimes(text);
  if (hits.length === 0) return null;
  let best: { hit: DateTimeHit; score: number } | null = null;
  for (const hit of hits) {
    const { before, after } = contextAround(text, hit.index, hit.raw.length);
    const around = `${before}${after}`;
    let score = dateNoiseScore(before, after);
    if (hit.hasTime) score += 4;
    if (kind === "deadline") {
      if (/(?:提交|递交)(?:（上传）)?(?:投标|响应)?文件截止|投标截止时间|递交截止时间|文件递交截止|响应文件递交/.test(around)) score += 6;
      if (/并于/.test(before) && /前(?:网上)?(?:递交|提交)/.test(after)) score += 6;
      if (/截止时间/.test(around) && !/获取|报名/.test(around)) score += 3;
      if (/开标时间/.test(around) && hit.hasTime) score += 2;
    } else {
      if (!/开标|开启/.test(around)) score -= 8;
      if (/开标时间|开标及解密|项目开标时间|开启时间|响应文件开启/.test(around)) score += 6;
      if (/变更为/.test(before) && /开标|开启/.test(around)) score += 6;
      // 「开始时间」是递交窗口的起点，不是开标时间；直接贴着标签的命中重罚
      if (/开始时间[：:]\s*$/.test(before)) score -= 15;
    }
    if (best === null || score > best.score || (score === best.score && hit.hasTime && !best.hit.hasTime)) {
      best = { hit, score };
    }
  }
  if (best === null || best.score < 3) return null;
  return best.hit.value;
}

const FIELD_BOUNDARY_LABELS = [
  "原公告的采购项目名称",
  "原公告的采购项目编号",
  "提交（上传）投标文件截止时间",
  "投标文件递交截止时间",
  "递交截止时间",
  "采购代理机构信息",
  "采购单位联系方式",
  "代理机构联系方式",
  "采购单位地址",
  "代理机构地址",
  "采购项目名称",
  "采购项目编号",
  "采购人信息",
  "采购人名称",
  "采购代理机构",
  "代理机构名称",
  "招标代理机构信息",
  "招标代理机构",
  "招标人名称",
  "招标人信息",
  "招标人",
  "投标保证金金额",
  "投标截止时间",
  "文件递交截止",
  "合同履行期限",
  "最高限价",
  "预算金额",
  "项目预算",
  "采购预算",
  "项目名称",
  "项目编号",
  "采购单位",
  "代理机构",
  "采购人",
  "控制价",
  "拦标价",
  "磋商保证金",
  "投标保证金",
  "保证金",
  "截止时间",
  "开标时间",
  "开标地点",
  "服务期限",
  "联系方式",
  "联系电话",
  "联系人",
  "行政区域",
  "公告时间",
  "发布时间",
  "采购需求",
  "地址",
  "邮编",
  "品目",
] as const;

const FIELD_LABEL_ALT = [...FIELD_BOUNDARY_LABELS]
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const FIELD_LABEL_SUFFIX = `(?:[（(][^）)]{0,16}[）)])?`;

/** Stop a captured value at the next field label, leftover pipe, or table cell. */
const FIELD_BOUNDARY = new RegExp(
  `(?=\\s*(?:${FIELD_LABEL_ALT})${FIELD_LABEL_SUFFIX}(?:\\s*[：:=]|[ \\t]{2,})|(?:^|\\s)\\|\\s*(?:${FIELD_LABEL_ALT})\\s*\\|)`,
);

function cutAtFieldBoundary(raw: string): string {
  const value = raw.replace(/[\s\u00a0\u3000]+/g, " ").trim();
  if (value === "") return "";
  const cut = value.split(FIELD_BOUNDARY)[0] ?? value;
  return cut.replace(/[。；;|]+$/u, "").trim();
}

const TABLE_SUB_LABEL = /^(?:名称|名\s*称|地址|联系方式|联系电话|电\s*话|邮编|联系人)$/;
const FIELD_LABEL_EXACT = new Set<string>(FIELD_BOUNDARY_LABELS);

function normalizeFieldToken(value: string): string {
  return value
    .replace(/[\s\u00a0\u3000]+/g, "")
    .replace(/[：:=]+$/u, "")
    .replace(/[（(][^）)]{0,16}[）)]$/u, "");
}

/** A captured value that is itself a field label is never a real answer. */
function isBareFieldLabel(value: string): boolean {
  const trimmed = value.replace(/[\s\u00a0\u3000]+/g, " ").trim();
  if (trimmed === "") return false;
  if (TABLE_SUB_LABEL.test(trimmed)) return true;
  const compact = normalizeFieldToken(trimmed);
  return compact !== "" && FIELD_LABEL_EXACT.has(compact);
}

function acceptExtracted(value: string): string {
  if (value === "" || isBareFieldLabel(value)) return "";
  return value;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.replace(/^\s+|\s+$/g, "");
  if (trimmed === "") return [];
  const raw = trimmed.includes("|")
    ? trimmed.split("|")
    : trimmed.includes("\t")
      ? trimmed.split("\t")
      : [];
  if (raw.length === 0) return [];
  const cells = raw.map((cell) => cell.replace(/[\s\u00a0\u3000]+/g, " ").trim());
  if (trimmed.includes("|")) {
    if (cells[0] === "") cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  }
  return cells;
}

function isMarkdownSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => cell === "" || /^:?-{2,}:?$/.test(cell));
}

/**
 * The next row of the same table. A blank line is still inside the table (real
 * announcements separate a header row from its data row with one), but a line of
 * prose ends it: skipping prose used to walk out of the table and land on an
 * unrelated tab-separated row dozens of lines below (BL-379: 中小企业声明函
 * template read as the project name).
 */
function nextDataRow(lines: readonly string[], from: number): string[] {
  for (let i = from; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const cells = splitTableRow(line);
    if (cells.length === 0) return [];
    if (isMarkdownSeparator(cells)) continue;
    return cells;
  }
  return [];
}

function tableCell(text: string, labels: string | readonly string[]): string {
  const lines = text.split(/\r?\n/);
  for (const label of typeof labels === "string" ? [labels] : labels) {
    const wanted = normalizeFieldToken(label);
    if (wanted === "") continue;
    for (let i = 0; i < lines.length; i++) {
      const cells = splitTableRow(lines[i] ?? "");
      if (cells.length === 0) continue;
      const col = cells.findIndex((cell) => normalizeFieldToken(cell) === wanted);
      if (col < 0) continue;
      const sameRow = cells[col + 1] ?? "";
      const sameRow2 = cells[col + 2] ?? "";
      let picked = TABLE_SUB_LABEL.test(sameRow) ? sameRow2 : sameRow;
      if (picked === "" || isBareFieldLabel(picked)) {
        picked = nextDataRow(lines, i + 1)[col] ?? "";
      }
      const value = acceptExtracted(cutAtFieldBoundary(picked));
      if (value !== "") return value;
    }
  }
  return "";
}

function cleanProjectName(raw: string): string {
  let value = cutAtFieldBoundary(raw);
  value = value.replace(/^(?:采购)?项目名称[：:\s]*/, "");
  value = value.split(/\s{2,}|\s+(?=\d+\s*[.．、]\s*(?:项目预算|最高限价|预算金额|采购需求))/)[0] ?? value;
  value = value.replace(/[（(][A-Za-z][）)]\s*$/, "").trim();
  value = value.replace(/(?:公开)?(?:招标|竞争性磋商|竞争性谈判|询价采购|单一来源|中标|成交|更正)公告$/, "").trim();
  return acceptExtracted(value.replace(/[。；;]+$/, "").trim());
}

function cleanParty(raw: string): string {
  let value = cutAtFieldBoundary(raw);
  value = value.split(/地址|联系方式|联系电话|电\s*话|邮编|。/)[0] ?? value;
  value = value.replace(/\s+\d+\s*[.．、].*$/, "").trim();
  value = value.replace(/[，,].*$/, "").trim();
  return acceptExtracted(value.slice(0, 60).trim());
}

function cleanProjectNo(raw: string): string {
  return cutAtFieldBoundary(raw.trim().replace(/[\s\u00a0\u3000].*$/, "").replace(/[。；;].*$/, "").trim());
}

function extractProjectNo(blob: string): string {
  const patterns = [
    /(?:^|\n)\s*(?:\d+[．.、]\s*)?项目编号[：:]\s*(\S[^\n]{0,90})/,
    /(?:^|\n)\s*(?:\d+[．.、]\s*)?项目编号[ \t]{2,}(\S[^\n]{0,90})/,
    /(?:\d+[．.、]\s*)?项目编号[：:]\s*([A-Za-z0-9\[\]（）()\-\/_第字号][A-Za-z0-9\[\]（）()\-\/_第字号．.、]{2,80})/,
    /原公告的采购项目编号[：:]\s*(\S[^\n]{0,90})/,
    /采购项目编号[：:]\s*(\S[^\n]{0,90})/,
  ];
  for (const pattern of patterns) {
    const match = blob.match(pattern);
    const raw = match?.[1]?.trim() ?? "";
    if (raw === "") continue;
    return cleanProjectNo(raw);
  }
  // Explicit filled fields precede table headers in later bid templates/item lists.
  return cleanProjectNo(tableCell(blob, ["采购项目编号", "项目编号"]));
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  return CHAPTER_HEADING.test(trimmed)
    || NUMBERED_HEADING.test(trimmed)
    || NAMED_HEADING.test(trimmed)
    || CN_ENUM_HEADING.test(trimmed)
    || CN_PAREN_HEADING.test(trimmed);
}

function stripTocFromPage(page: string): string {
  const lines = page.split(/\r?\n/);
  const nonempty = lines.filter((line) => line.trim() !== "");
  const tocHits = nonempty.filter((line) => TOC_LINE.test(line.trim()));
  if (tocHits.length >= 5 && tocHits.length >= nonempty.length * 0.6) return "";
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = (lines[i] ?? "").trim();
    if (TOC_LINE.test(trimmed) || /^目\s*录$/.test(trimmed)) {
      let j = i;
      let toc = 0;
      while (j < lines.length) {
        const t = (lines[j] ?? "").trim();
        if (t === "" || TOC_LINE.test(t) || /^目\s*录$/.test(t) || t.startsWith("说明：目录")) {
          if (TOC_LINE.test(t)) toc += 1;
          j += 1;
          continue;
        }
        break;
      }
      if (toc >= 5 || /^目\s*录$/.test(trimmed)) {
        i = j;
        continue;
      }
    }
    out.push(lines[i] ?? "");
    i += 1;
  }
  return out.join("\n");
}

/** BL-193：OCR 稀疏原页拼接后页码会漂——调用方可传 `pageNos` 把每个 \f 段
 *  映射回原页号；缺省从 1 顺排（原行为）。 */
export function splitSections(text: string, opts?: { pageNos?: readonly number[] }): TenderSection[] {
  const pages = text.split(/\f/);
  const cleaned = pages.map((page, index) => ({ page: opts?.pageNos?.[index] ?? index + 1, body: stripTocFromPage(page) }))
    .filter((item) => item.body.trim() !== "");
  const sections: TenderSection[] = [];
  for (const page of cleaned) {
    const lines = page.body.split(/\r?\n/);
    let heading = "";
    let buf: string[] = [];
    const flush = () => {
      const body = buf.join("\n").trim();
      if (heading === "" && body === "") return;
      sections.push({ heading: heading === "" ? "正文" : heading, body, page: page.page });
    };
    for (const line of lines) {
      if (isHeading(line.trim()) && (buf.length > 0 || heading !== "")) {
        flush();
        heading = line.trim();
        buf = [];
        continue;
      }
      if (isHeading(line.trim()) && heading === "" && buf.every((item) => item.trim() === "")) {
        heading = line.trim();
        continue;
      }
      buf.push(line);
    }
    flush();
  }
  return sections.length > 0 ? sections : [{ heading: "正文", body: stripTocFromPage(text) }];
}

function joinedText(sections: readonly TenderSection[]): string {
  return sections.map((section) => `${section.heading}\n${section.body}`).join("\n");
}

function sectionsMatching(sections: readonly TenderSection[], pattern: RegExp): TenderSection[] {
  return sections.filter((section) => pattern.test(section.heading) || pattern.test(section.body.slice(0, 40)));
}

/** 条款块：命中节起向后吸收子条款小节（数字/括号编号标题是从属项不是新块），
 *  到章、编目或命名标题为止——资格 2.1、技术表（一）（二）被子标题切碎要靠区间取（RB-25/26/27）。 */
function clauseBlockEnd(sections: readonly TenderSection[], start: number): number {
  let end = start + 1;
  while (end < sections.length) {
    const heading = sections[end]!.heading;
    if (heading !== "" && (CHAPTER_HEADING.test(heading) || CN_ENUM_HEADING.test(heading) || NAMED_HEADING.test(heading))) break;
    end += 1;
  }
  return end;
}

/** 标题样小节名：短、不带句读/竖线——「…但不得修改采购标的和资格条件。」这类
 *  含关键词的正文句不当块起点。 */
function titleish(heading: string): boolean {
  return heading !== "" && heading.length <= 40 && !/[。，；;|…]/.test(heading);
}

/** 命中节各自的条款块区间保序合并成 blob（重叠区间去重）；
 *  只有「标题样」命中节才向后吸收子条款小节，正文句/表格行命中只取自身。 */
function clauseBlobs(sections: readonly TenderSection[], hits: readonly TenderSection[]): string {
  const picked = new Set<number>();
  for (const hit of hits) {
    const start = sections.indexOf(hit);
    if (start < 0) continue;
    const end = titleish(hit.heading) ? clauseBlockEnd(sections, start) : start + 1;
    for (let index = start; index < end; index += 1) picked.add(index);
  }
  return [...picked].sort((a, b) => a - b).map((index) => `${sections[index]!.heading}\n${sections[index]!.body}`).join("\n");
}



function nearKeyword(text: string, keyword: RegExp, window = AMOUNT_NEAR): string[] {
  const hits: string[] = [];
  const re = new RegExp(keyword.source, keyword.flags.includes("g") ? keyword.flags : `${keyword.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    hits.push(text.slice(match.index, Math.min(text.length, match.index + match[0].length + window)));
  }
  return hits;
}

function firstAmount(snippets: readonly string[]): number | null {
  for (const snippet of snippets) {
    const amount = normalizeAmountWan(snippet);
    if (amount !== null) return amount;
  }
  return null;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。；;\n])/).map((item) => item.trim()).filter(Boolean);
}

function isPolicyCitation(text: string): boolean {
  const t = text.trim();
  if (t === "" || t === "/" || /^[／/]+$/.test(t)) return true;
  if (/特定资格要求/.test(t) && !/应|须|不得|具有|具备/.test(t)) return true;
  const policy = t.startsWith("《")
    || /落实政府采购政策|财库〔|国办发〔|中小企业政策|不专门面向中小企业/.test(t);
  return policy && !/应|须|不得|具有|具备/.test(t);
}

function splitQualificationItems(text: string): Array<{ id: string; text: string }> {
  const marks: Array<{ index: number; id: string; len: number }> = [];
  const seen = new Set<number>();
  const push = (index: number, id: string, len: number) => {
    if (id === "" || seen.has(index) || len <= 0) return;
    seen.add(index);
    marks.push({ index, id, len });
  };
  for (const match of text.matchAll(/\d+\.\d+/g)) {
    push(match.index ?? 0, match[0] ?? "", match[0].length);
  }
  for (const match of text.matchAll(/(^|[\n。；;：:])(\s*)(\d+)\.(?!\d)/gm)) {
    const prefix = `${match[1] ?? ""}${match[2] ?? ""}`;
    const id = match[3] ?? "";
    push((match.index ?? 0) + prefix.length, id, id.length + 1);
  }
  for (const match of text.matchAll(/(^|\n)(\s*)[（(](\d+)[）)]/g)) {
    const prefix = `${match[1] ?? ""}${match[2] ?? ""}`;
    const id = match[3] ?? "";
    const index = (match.index ?? 0) + prefix.length;
    const marker = text.slice(index).match(/^[（(]\d+[）)]/)?.[0] ?? "";
    push(index, id, marker.length);
  }
  // 「4、未被列入失信被执行人…」——顿号编号也是独立资格项（RB-25）。
  for (const match of text.matchAll(/(^|\n)(\s*)(\d+)[、]\s*/g)) {
    const prefix = `${match[1] ?? ""}${match[2] ?? ""}`;
    const id = match[3] ?? "";
    push((match.index ?? 0) + prefix.length, id, (match[0] ?? "").length - prefix.length);
  }
  marks.sort((a, b) => a.index - b.index);
  const items: Array<{ id: string; text: string }> = [];
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i]!;
    const end = marks[i + 1]?.index ?? text.length;
    const body = text.slice(mark.index + mark.len, end)
      .replace(/其中第[\s\S]*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (body === "") continue;
    const textItem = body.replace(/[。；;]+$/, "") + "。";
    if (/^(硬性资格|一般资格|应当具备下列|其中第|无|不涉及|\/)/.test(textItem)) continue;
    if (/^落实政府采购政策需满足的资格要求[：:]?\s*(无|不涉及|\/)/.test(textItem)) continue;
    // 「审查方法/审查标准：…」是审查程序描述不是资格条件（RB-25）。
    if (/^审查(方法|标准|时间|地点|程序|方式|小组)[：:]/.test(textItem)) continue;
    if (isPolicyCitation(textItem)) continue;
    if (textItem.length < 10 || /^\.。$/.test(textItem)) continue;
    if (/项目编号|项目名称|最高限价|采购需求|开标时间|开标操作|投标操作|报名操作|采购人信息|代理机构信息|项目联系|不需要投标保证金|澄清\/修改|融资|品目号|合同履行期限|在线解密|投标提醒/.test(textItem)) continue;
    items.push({ id: mark.id, text: textItem });
  }
  return items;
}

function numberedItems(text: string, style: "paren" | "dot" | "any" = "any"): Array<{ id: string; text: string }> {
  const items: Array<{ id: string; text: string }> = [];
  const re = style === "paren"
    ? /(?:^|\n)\s*[（(](\d+)[）)]\s*(.+)/g
    : style === "dot"
      ? /(?:^|\n)\s*(\d+)[.、]\s+(\S.+)/g
      : /(?:^|\n)\s*(?:[（(](\d+)[）)]|(\d+)[.、])\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[1] || match[2] || "";
    const raw = (style === "any" ? match[3] ?? match[2] : match[2]) ?? "";
    const body = raw.replace(/\s+/g, " ").trim();
    if (id === "" || body === "") continue;
    items.push({ id, text: body.replace(/[。；;]+$/, "") + "。" });
  }
  return items;
}

const STRUCTURE_SKIP = /缺一不可|分隔页|应包括|独立承担民事责任|营业执照|失信被执行|依法缴纳|注意事项|封面前/;
const STRUCTURE_MARK = /(?:\d+[.、．]|[（(]\d+[）)]|[（(][一二三四五六七八九十]+[）)]|[一二三四五六七八九十]+、)/g;
/** 组成项只允许出自「章节标题点名了投标文件组成/格式/目录/内容」的区段。 */
const STRUCTURE_HEADING = /(?:(?:投标|响应|应答|报价)(?:文件|材料)(?:的)?(?:组成|目录|内容))|(?:应|须)(?:当)?提交[^，。]{0,15}(?:投标|响应|报价|资格)[^，。]{0,15}(?:文件|材料|资料)/;
/** 「（一）通用商务文件」「4.6 商务文件」这类简短小节名也算组成清单，但目录行「六、技术文件（…）……页码」不算。 */
const isStructureHeading = (heading: string): boolean =>
  STRUCTURE_HEADING.test(heading)
  || (/^(?:[（(][^）)]*[）)]|\d+[.、．]?)\s*[^\s]{0,4}(?:商务|技术)(?:文件|标书|资料)\s*[：:]?$/.test(heading) && heading.length <= 20);

/**
 * 组成项清洗：剥掉列表编号/导点页码/句尾标点后，
 * 必须是 2–30 字的文档名——不含句读、不以「的/及/和…」起头、不以逗号顿号冒号收尾。
 * 不合格返回 ""。
 */
export function cleanStructureItem(raw: string): string {
  if (/(?:…+\s*页码|[-–—]\s*\d+\s*[-–—]|\s\d{1,3})\s*$/.test(raw.trim())) return "";
  let item = raw
    .replace(/^(?:附件\s*\d+[.、．]?\s*|\d+[.、．]|[（(]\d+[）)]|[（(][一二三四五六七八九十]+[）)]|[一二三四五六七八九十]+、)\s*/, "")
    .replace(/…+.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[。；;：:、！？?!]+$/, "")
    .trim();
  // 「投 标 函」这类字间空格是排版噪声，条名内不留空格
  item = item.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff（(])/g, "");
  // 长尾括号（「（不提供…视为无效响应）」「（投标人代表非法定代表人时提供，须加盖公章）」
  // 这类条件说明）整段剥掉再判形（M1 F3）。
  const tailParenEarly = item.match(/[（(]([^（）()]*)[）)]\s*$/);
  if (tailParenEarly !== null && (tailParenEarly[1]?.length ?? 0) > 8) item = item.slice(0, tailParenEarly.index).trim();
  if (/[。；！？?!，,；;：:]/.test(item)) return "";
  if (/[，、：,;:]$/.test(item)) return "";
  if (/^(?:的|及|和|或|等|与|并|且|不|如|按|除|外)/.test(item)) return "";
  if (/^(?:我|本|请|随|在|若|对|为|经|将|可|应|须|凡|此|被|由|参)/.test(item)) return "";
  if (/详见|见第|见附|参照|按照本表|上传/.test(item)) return "";
  if (/格式$/.test(item) && item.length > 3) return "";
  const tailParen = item.match(/[（(]([^（）()]*)[）)]\s*$/);
  if (tailParen !== null && (tailParen[1]?.length ?? 0) > 8) item = item.slice(0, tailParen.index).trim();
  if (item === "") return "";
  // 义务/同意句式不是文档名：「应提供」「视为」「同意向贵方」出局；裸「应」（响应表）与「须知」文体名词放行。
  const checked = item.replace(/[（(][^（）()]*[）)]/g, "");
  if (/应提供|应当|须(?!知)|必须|不得|视为|同意|承诺向/.test(checked)) return "";
  // 组成项是文档名：尾注括号（「（须加盖公章）」之类）不算在长度与后缀判定里，句子残片直接出局。
  const core = item.replace(/[（(][^（）()]*[）)]\s*$/, "");
  if (core.length < 2 || core.length > 30) return "";
  if (!/(?:函|表|书|单|册|面|证明|声明|承诺|方案|协议|报告|记录|清单|凭证|说明|介绍|情况|文件|材料|资料|附录|标|照|证|页|件)$/.test(core)) return "";
  if (/标$/.test(core) && core.length < 3) return "";
  if (STRUCTURE_SKIP.test(item) || /^\d+$/.test(item)) return "";
  return item;
}

function takeStructureTitle(raw: string): string {
  return raw
    .replace(/^(?:\d+[.、．]|[（(]\d+[）)]|[（(][一二三四五六七八九十]+[）)]|[一二三四五六七八九十]+、)\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[。；;：:]+$/, "");
}

function structureTitlesByPunctuation(text: string): string[] {
  const region = text
    .replace(/(?:投标文件(?:的)?组成|投标文件格式)[：:\s]*/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /[、；;]/.test(line) && !STRUCTURE_SKIP.test(line))
    ?? "";
  if (region === "") return [];
  const items: string[] = [];
  for (const part of region.split(/[；;]/)) {
    const stripped = takeStructureTitle(part);
    const pieces = /、/.test(stripped) ? stripped.split(/、/) : [stripped];
    for (const piece of pieces) {
      const raw = cleanStructureItem(piece);
      if (raw === "") continue;
      if (!items.includes(raw)) items.push(raw);
    }
  }
  return items.slice(0, 20);
}

export function structureTitlesFrom(text: string): string[] {
  const items: string[] = [];
  const marks: Array<{ start: number; end: number; skip: boolean }> = [];
  const re = new RegExp(STRUCTURE_MARK.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const after = text.slice(match.index + match[0].length);
    marks.push({
      start: match.index,
      end: match.index + match[0].length,
      skip: /^\d/.test(after.trimStart()),
    });
  }
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i]!.skip) continue;
    const seg = text.slice(marks[i]!.end, marks[i + 1]?.start ?? text.length).split(/\r?\n/);
    let line = seg[0] ?? "";
    // PDF 断行会把「（须加盖公|章）」切开：括号未闭合时续一行再判。
    let opens = (line.match(/[（(]/g) ?? []).length - (line.match(/[）)]/g) ?? []).length;
    for (let k = 1; opens > 0 && k <= 2 && k < seg.length; k += 1) {
      line += seg[k];
      opens += (seg[k]!.match(/[（(]/g) ?? []).length - (seg[k]!.match(/[）)]/g) ?? []).length;
    }
    const raw = cleanStructureItem(line);
    if (raw === "") continue;
    if (!items.includes(raw)) items.push(raw);
  }
  if (items.length >= 2) return items.slice(0, 20);
  const punctuated = structureTitlesByPunctuation(text);
  return (punctuated.length >= 2 ? punctuated : items).slice(0, 20);
}

function extractProposalStructure(sections: readonly TenderSection[], blob: string): string[] {
  // 只从标题点名「组成/格式/目录/内容」的区段里取项（F3），不再把全文中
  // 碰巧出现「投标文件组成」的段落当来源——那些句子残片会变成标书章节名。
  const regions: string[] = [];
  const chapterBreak = (heading: string): boolean =>
    /第[一二三四五六七八九十\d]+\s*（章|部分|编）/.test(heading) || /^\d+\.\d/.test(heading);
  // 格式章内部「（五）开标一览表」这类模板条会被切成小节：标题是条样式（（一）/
  // 一、/3 空格式），而「4.2.1」式条款编号小节是正文，不吞。
  const itemHeading = (heading: string): boolean =>
    /^(?:[（(]\d+[）)]|[（(][一二三四五六七八九十]+[）)]|[一二三四五六七八九十]+、|\d+\s(?!\d))/.test(heading)
    && !/^\d+\.\d/.test(heading);
  const formatRegions: string[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    const isFormatChapter = /格式/.test(section.heading) && /(?:投标|响应|应答|报价)文件|文件格式/.test(section.heading);
    if (!isStructureHeading(section.heading) && !isFormatChapter) continue;
    const own = `${section.heading}\n${section.body}`;
    (isFormatChapter ? formatRegions : regions).push(own);
    // 章节本体已经给出 ≥5 个组成项就不再吞小节；只有正文把组成列表切碎时才向后看。
    const ownItems = structureTitlesFrom(own).length > 0
      ? structureTitlesFrom(own)
      : numberedItems(own, "any").map((entry) => cleanStructureItem(entry.text)).filter((item) => item !== "");
    // 组成章（非格式章）自己的条目够了就收——继续向后吞会把「报价说明/磋商说明」这类
    // 指导性小节标题混成组成项；只有条目不足且下一小节是条目样式标题时才补一格。
    if (ownItems.length >= 2 && !isFormatChapter) continue;
    for (let k = i + 1; k < sections.length && k < i + 40; k += 1) {
      const next = sections[k]!;
      if (chapterBreak(next.heading)) break;
      if (!itemHeading(next.heading) && !isStructureHeading(next.heading)) break;
      (isFormatChapter ? formatRegions : regions).push(`${next.heading}\n${next.body}`);
      i = k;
    }
  }
  let region = regions.join("\n");
  if (region.trim() === "") {
    const hit = blob.match(/(?:(?:投标|响应|应答|报价)(?:文件|材料)(?:的)?(?:组成|目录|内容)|(?:商务|技术)(?:文件|标书|资料)|(?:应|须)(?:当)?提交[^，。]{0,15}(?:文件|材料|资料))[：:\s]*([\s\S]{0,1600})/);
    region = hit?.[1] ?? "";
  }
  const fromNumbered = structureTitlesFrom(region);
  const merged = fromNumbered.length > 0
    ? fromNumbered
    : numberedItems(region, "any").map((entry) => cleanStructureItem(entry.text)).filter((item) => item !== "");
  const items: string[] = [];
  const seen = new Set<string>();
  for (const item of merged) {
    const key = item.normalize("NFKC").replace(/\s+/g, "");
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  // 格式章补充：只有章内明确写了「按下列组成顺序编制 / 须包含…部分」这类组成宣告才收项——
  // 光有章目录页的格式章（页码目录）不出项。
  const formatRegion = formatRegions.join("\n");
  if (/按下列|由下列|组成顺序|须包含[^，。]{0,20}部分|包括以下|分为[^，。]{0,10}部分/.test(formatRegion)) {
    const formatItems = structureTitlesFrom(formatRegion).length > 0
      ? structureTitlesFrom(formatRegion)
      : numberedItems(formatRegion, "any").map((entry) => cleanStructureItem(entry.text)).filter((item) => item !== "");
    for (const raw of formatItems) {
      const key = raw.normalize("NFKC").replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(raw);
    }
  }
  // 列表里有「*」强制标记时，未标记的条目是补充说明，只取带标记的必交件。
  const starred = items.filter((item) => item.startsWith("*"));
  return (starred.length >= 2 ? starred : items).slice(0, 20);
}

function parseHardIds(sectionText: string): Set<string> | null {
  const match = sectionText.match(/第((?:[（(]\d+[）)])+)项为硬性/);
  if (match === null) return null;
  return new Set([...(match[1] ?? "").matchAll(/\d+/g)].map((item) => item[0] ?? "").filter(Boolean));
}

function classifyQualification(text: string): Qualification["category"] {
  if (/注册资本|审计|财务/.test(text)) return "finance";
  if (/证书|认证|资质|等级/.test(text)) return "certificate";
  if (/业绩|合同/.test(text)) return "performance";
  if (/人员|项目经理|项目负责人|职称/.test(text)) return "staff";
  if (/法人|失信|处罚|信用/.test(text)) return "legal";
  return "other";
}

function isHardQualification(text: string, sectionText: string, id: string): boolean {
  if (/加分|优先/.test(text) && !/不接受|否决|不得/.test(text)) return false;
  const hardIds = parseHardIds(sectionText);
  if (hardIds !== null) return hardIds.has(id);
  if (/应|须|必须|应当具备|不接受|否决|不得/.test(text)) return true;
  if (QUAL_HEADING.test(sectionText.slice(0, 120))) return true;
  return false;
}

function locator(relPath: string, page?: number, quote?: string): FactLocator | undefined {
  if (relPath === "") return undefined;
  return { relPath, ...(page === undefined ? {} : { page }), ...(quote === undefined ? {} : { quote: quote.slice(0, 400) }) };
}

const DEPOSIT_FORMS = ["银行转账", "银行保函", "电汇", "保函", "保险", "担保", "现金"] as const;

function extractDepositForms(text: string): string[] {
  const found: string[] = [];
  for (const form of DEPOSIT_FORMS) {
    if (!text.includes(form)) continue;
    if (form === "保函" && found.includes("银行保函")) continue;
    found.push(form);
  }
  return found;
}

function collectScoring(lines: readonly string[], fallbackPart: ScoringItem["part"]): ScoringItem[] {
  const compact = lines.map((line) => line.trim()).filter((line) => line !== "");
  const items: ScoringItem[] = [];
  for (let i = 0; i < compact.length; i += 1) {
    const line = compact[i] ?? "";
    const single = parseScoringLine(line, fallbackPart);
    if (single !== null) {
      items.push(single);
      continue;
    }
    if (!/^(商务|技术|价格|其他)$/.test(line)) continue;
    const item = compact[i + 1] ?? "";
    const score = compact[i + 2] ?? "";
    const basis = compact[i + 3] ?? "";
    if (item === "" || !/^\d+(?:\.\d+)?$/.test(score) || /评分|满分/.test(item)) continue;
    items.push({
      id: "",
      part: line as ScoringItem["part"],
      item,
      maxScore: Number(score),
      basis,
    });
    i += 3;
  }
  return items;
}

function parseScoringLine(line: string, fallbackPart: ScoringItem["part"]): ScoringItem | null {
  const slash = line.match(/^(商务|技术|价格|其他)\s*\/\s*(.+?)\s*\/\s*(\d+(?:\.\d+)?)\s*分?\s*\/\s*(.+)$/);
  if (slash) {
    return {
      id: "",
      part: (slash[1] ?? "其他") as ScoringItem["part"],
      item: (slash[2] ?? "").trim(),
      maxScore: Number(slash[3]),
      basis: (slash[4] ?? "").trim(),
    };
  }
  const spaced = line.match(/^(商务|技术|价格|其他)\s+(\S.*?)\s+(\d+(?:\.\d+)?)\s+(\S.+)$/);
  if (spaced) {
    return {
      id: "",
      part: (spaced[1] ?? "其他") as ScoringItem["part"],
      item: (spaced[2] ?? "").trim(),
      maxScore: Number(spaced[3]),
      basis: (spaced[4] ?? "").trim(),
    };
  }
  const tabbed = line.split(/\t|\s{2,}/).map((part) => part.trim()).filter(Boolean);
  const part0 = tabbed[0] ?? "";
  const part2 = tabbed[2] ?? "";
  if (tabbed.length >= 4 && /^(商务|技术|价格|其他)$/.test(part0) && /^\d+(?:\.\d+)?$/.test(part2)) {
    return {
      id: "",
      part: part0 as ScoringItem["part"],
      item: tabbed[1] ?? "",
      maxScore: Number(part2),
      basis: tabbed.slice(3).join(" "),
    };
  }
  const scored = line.match(/^(.+?)[（(](\d+(?:\.\d+)?)分[）)](.*)$/);
  if (scored && !/总分|其中/.test(line)) {
    return {
      id: "",
      part: fallbackPart,
      item: (scored[1] ?? "").replace(/^(?:商务|技术|价格|其他)[\s/、:：]+/, "").trim(),
      maxScore: Number(scored[2]),
      basis: (scored[3] ?? "").trim() || (scored[0] ?? ""),
    };
  }
  return null;
}

/** 采购需求表格的通用列名；PDF 断行把词拆进相邻行时，≤2 字格子按列名子串放行。 */
const TECH_HEADER_WORDS = [
  "序号", "名称", "品名", "品目", "项目", "货物名称", "仪器名称", "设备名称", "货物", "设备", "仪器",
  "单位", "数量", "参数", "主要参数", "技术参数", "技术要求", "规格", "型号", "品牌", "产地", "制造商",
  "备注", "要求", "指标", "技术指标", "单价", "合价", "总价", "金额", "页码", "证明材料", "服务内容",
] as const;
const TECH_HEADER_EXACT = new Set<string>(TECH_HEADER_WORDS);

/** 纯表头行：≥2 个格子且每个格子都是表列名（或断行残片）——不是技术要点内容行（BL-62）。 */
function isTableHeaderLine(line: string): boolean {
  const cells = line.split(/[\s|、，,\t]+/).map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 2) return false;
  return cells.every((cell) => {
    if (TECH_HEADER_EXACT.has(cell)) return true;
    return cell.length <= 2 && TECH_HEADER_WORDS.some((word) => word.includes(cell));
  });
}

function currentPart(heading: string, fallback: ScoringItem["part"]): ScoringItem["part"] {
  if (/商务/.test(heading)) return "商务";
  if (/技术/.test(heading)) return "技术";
  if (/价格|报价/.test(heading)) return "价格";
  return fallback;
}

function fieldConfidence(value: unknown): FactConfidence {
  if (value === null || value === undefined) return "missing";
  if (typeof value === "string" && value.trim() === "") return "missing";
  if (Array.isArray(value) && value.length === 0) return "missing";
  return "regex";
}

function firstLineValue(text: string, label: RegExp): string {
  const match = text.match(label);
  let captured = match?.[1]?.replace(/[\s\u3000]+$/g, "").trim() ?? "";
  if (match && (captured === "" || isBareFieldLabel(captured))) {
    captured = nextNonEmptyLine(text, (match.index ?? 0) + match[0].length);
  }
  return acceptExtracted(cutAtFieldBoundary(captured));
}

/** 文字版 PDF：已知字段名后跟 ≥2 个空格或制表符，视为与值的分隔（同行、无冒号）。 */
export function sameLineSpacedValue(text: string, label: RegExp): string {
  const flags = label.flags.includes("g") ? label.flags : `${label.flags}g`;
  const re = new RegExp(`(?:^|\\n)\\s*(?:\\d+[．.、.]\\s*)?(?:${label.source})[ \\t]{2,}(\\S[^\\n]*)`, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = acceptExtracted(cutAtFieldBoundary(match[1] ?? ""));
    if (value !== "") return value;
  }
  return "";
}

/** 文字版 PDF：字段名独占一行（可带冒号），值在下一行。同一行无冒号不取，避免表头串值。 */
function nextLineAfterLabel(text: string, label: RegExp): string {
  const flags = label.flags.includes("m") ? label.flags : `${label.flags}m`;
  const re = new RegExp(`(?:^|\\n)\\s*(?:\\d+[．.、.]\\s*)?(?:${label.source})\\s*[：:]?\\s*$`, flags);
  const match = re.exec(text);
  if (match === null) return "";
  return acceptExtracted(cutAtFieldBoundary(nextNonEmptyLine(text, (match.index ?? 0) + match[0].length)));
}

function partyName(text: string, header: RegExp): string {
  const re = new RegExp(`${header.source}[\\s\\S]{0,160}?名\\s*称[：:]\\s*([^\\n]+)`, header.flags.includes("g") ? header.flags : `${header.flags}g`);
  const match = re.exec(text);
  let captured = match?.[1]?.replace(/[\s\u3000]+$/g, "").trim() ?? "";
  if (match && (captured === "" || isBareFieldLabel(captured))) {
    captured = nextNonEmptyLine(text, (match.index ?? 0) + (match[0] ?? "").length);
  }
  if (captured !== "") return acceptExtracted(cutAtFieldBoundary(captured));
  const block = text.match(new RegExp(`${header.source}[\\s\\S]{0,200}`));
  return block === null ? "" : nextLineAfterLabel(block[0] ?? "", /名\s*称/);
}

export function extractTenderFacts(
  sections: readonly TenderSection[],
  sourceFiles: readonly TenderSourceFile[],
  projectId: string,
): TenderFacts {
  const facts = emptyTenderFacts(projectId);
  const fullBlob = joinedText(sections);
  const attachAt = fullBlob.indexOf("<<<BID-ATTACH>>>");
  const blob = attachAt >= 0 ? fullBlob.slice(0, attachAt) : fullBlob;
  // 兜底来源取第一份有可读文本的文件——首件受损/不受支持时不把条款挂到它名下（D05）。
  const relPath = sourceFiles.find((file) => file.chars > 0)?.relPath ?? sourceFiles[0]?.relPath ?? "";
  /** 节的来源文件：逐文件切分回填 relPath；合并切分的旧调用方退回第一可读文件。 */
  const relOf = (section: TenderSection | undefined): string =>
    section?.relPath !== undefined && section.relPath !== "" ? section.relPath : relPath;
  /** 条款文字实际落在哪节——locator 必须指向条款所在文件，不是一律第一文件（D05）。 */
  const sectionOf = (needle: string, preferred?: readonly TenderSection[]): TenderSection | undefined => {
    const probe = needle.replace(/\s+/g, "").slice(0, 24);
    if (probe === "") return undefined;
    const hit = (section: TenderSection) => `${section.heading}\n${section.body}`.replace(/\s+/g, "").includes(probe);
    return preferred?.find(hit) ?? sections.find(hit);
  };
  const scanOnly = sourceFiles.length > 0 && sourceFiles.every((file) => file.kind === "pdf-scan" || file.kind === "image" || file.kind === "unsupported")
    && blob.replace(/\s+/g, "").length < 80;
  if (scanOnly) {
    return {
      ...facts,
      sourceFiles: [...sourceFiles],
      notes: sourceFiles.flatMap((file) => file.kind === "pdf-scan" || file.kind === "image" ? ["需多模态识别"] : []),
    };
  }

  facts.projectName = cleanProjectName(
    tableCell(blob, "采购项目名称")
    || tableCell(blob, "项目名称")
    || firstLineValue(blob, /(?:^|[\n。；;\s]|(?:\d+[．.、]\s*))采购项目名称[：:]\s*(\S[^\n]{0,80})/)
    || firstLineValue(blob, /(?<!采购)项目名称[：:]\s*(\S[^\n]{0,80})/)
    || sameLineSpacedValue(blob, /(?<!采购)项目名称/)
    || sameLineSpacedValue(blob, /采购项目名称/)
    || nextLineAfterLabel(blob, /(?<!采购)项目名称/)
    || nextLineAfterLabel(blob, /采购项目名称/)
    || firstLineValue(blob, /原公告的采购项目名称[：:]\s*(\S[^\n]{0,80})/)
    || sections[0]?.heading.replace(/^第[一二三四五六七八九十百0-9]+[章节部分]\s*/, "").trim()
    || "",
  );
  if (facts.projectName === "招标公告" || facts.projectName === "正文" || facts.projectName === "") {
    const title = blob.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 8 && /项目$/.test(line));
    facts.projectName = cleanProjectName(title ?? facts.projectName);
  }
  facts.projectNo = extractProjectNo(blob);
  // 前附表常见「序号 字段名 值」单空格三列行（国采中心等）——要排在冒号模板行之前，
  // 否则合同模板里「1. 采购人名称：（空）」会先命中，nextNonEmptyLine 把下一行
  // 「2. 项目编号：」截成「2.」当采购人。
  facts.buyer = cleanParty(
    tableCell(blob, ["采购单位", "采购人名称", "采购人", "招标人"])
    || partyName(blob, /采购人信息/)
    || partyName(blob, /招标人信息/)
    || firstLineValue(blob, /^\s*\d+\s+采购人名称[ \t]+(\S[^\n]{0,80})/m)
    || firstLineValue(blob, /^\s*\d+\s+招标人名称[ \t]+(\S[^\n]{0,80})/m)
    || firstLineValue(blob, /^\s*\d+\s+采购单位[ \t]+(\S[^\n]{0,80})/m)
    || firstLineValue(blob, /^\s*\d+\s+招标人[ \t]+(\S[^\n]{0,80})/m)
    || firstLineValue(blob, /(?:\d+[．.、]\s*)?采购单位[：:]\s*(?!地址|联系)(\S[^\n]{0,80})/)
    || firstLineValue(blob, /(?:\d+\.\s*)?采购人(?:名称)?[：:]\s*(?!联系人)(\S[^\n]{0,80})/)
    || firstLineValue(blob, /(?:\d+[．.、]\s*)?招标人(?:名称)?[：:]\s*(?!联系人)(\S[^\n]{0,80})/)
    || sameLineSpacedValue(blob, /采购单位(?!地址|联系)/)
    || sameLineSpacedValue(blob, /采购人(?:名称)?(?!信息|联系)/)
    || sameLineSpacedValue(blob, /招标人(?:名称)?(?!信息|联系)/)
    || nextLineAfterLabel(blob, /采购单位/)
    || nextLineAfterLabel(blob, /采购人(?:名称)?(?!信息|联系)/)
    || nextLineAfterLabel(blob, /招标人(?:名称)?(?!信息|联系)/),
  );
  // 兜底链仍可能产出纯序号（「2.」）——采购人不可能是序号，退化成空比写错值强。
  if (/^\d+[．.、]?\s*$/.test(facts.buyer)) facts.buyer = "";
  facts.agency = cleanParty(
    tableCell(blob, ["采购代理机构", "招标代理机构", "代理机构名称", "代理机构"])
    || partyName(blob, /采购代理机构信息/)
    || partyName(blob, /招标代理机构信息/)
    || partyName(blob, /代理机构信息/)
    || firstLineValue(blob, /招标代理机构[：:]\s*(\S[^\n]{0,80})/)
    || firstLineValue(blob, /采购代理机构[：:]\s*(?!联系人)(\S[^\n]{0,80})/)
    || firstLineValue(blob, /代理机构(?:名称)?[：:]\s*(?!联系人)(\S[^\n]{0,80})/)
    || sameLineSpacedValue(blob, /招标代理机构(?!信息|联系)/)
    || sameLineSpacedValue(blob, /采购代理机构(?!信息|联系)/)
    || sameLineSpacedValue(blob, /代理机构(?:名称)?(?!信息|联系)/)
    || nextLineAfterLabel(blob, /招标代理机构(?!信息|联系)/)
    || nextLineAfterLabel(blob, /采购代理机构(?!信息|联系)/)
    || nextLineAfterLabel(blob, /代理机构(?:名称)?(?!信息|联系)/),
  );
  facts.budgetWan = labeledAmount(
    blob,
    /预算金额(?:[（(]万元?[）)])?|项目预算|采购预算(?!包)|招标预算|(?:^|[\n|])\s*预算(?:[（(]万元?[）)])?(?=\s*[：:=\n|]|\s+[\d零〇一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟两¥￥])/,
  ) ?? amountFromSnippet(tableCell(blob, ["预算金额", "项目预算", "采购预算", "招标预算", "预算"]));
  // 最高限价：NFKC 归一兼容写法（Kangxi 部首 最⾼、全角/半角括号）。正文与附件一起扫，
  // 收集「最高限价（元）」「最高限价：N元」「采购包/合同包最高限价」候选值——去重后唯一值即总价限价；
  // 逗号并列多包、多个不同限价、或远小于预算的单价（如 305 元/吨）都不是总价限价，保持 null。
  const nfkcFull = fullBlob.normalize("NFKC");
  const explicitWan = nfkcFull.match(/最高限价(?:[(（]如有[)）])?[：:]\s*([\d,]+(?:\.\d+)?)\s*万/);
  const yuanValues = new Set<number>();
  const pushYuan = (raw: string | undefined, index: number, span: number) => {
    if (raw === undefined) return;
    const tail = nfkcFull.slice(index + span, index + span + 12);
    if (/^\s*[、，,]\s*\d/.test(tail)) return; // 「9067995,5445000,3627000」多包并列 → 非单一总价
    const n = Number(raw.replaceAll(",", ""));
    if (!Number.isFinite(n)) return;
    if (n < 10_000) return; // 单价限价（如 305 元/吨）不是总价
    yuanValues.add(n);
  };
  for (const m of nfkcFull.matchAll(/最高限价[(（]元[)）][\s:：]{0,15}(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)) {
    pushYuan(m[1], m.index ?? 0, m[0].length);
  }
  for (const m of nfkcFull.matchAll(/最高限价[：:]\s*(?:人民币\s*)?([\d,]+(?:\.\d+)?)\s*元/g)) {
    pushYuan(m[1], m.index ?? 0, m[0].length);
  }
  if (explicitWan) {
    facts.ceilingWan = Number(String(explicitWan[1]).replaceAll(",", ""));
  } else if (/最高限价[(（]元[)）][\s:：]{0,8}\//.test(nfkcFull)) {
    facts.ceilingWan = null; // 「最高限价（元）：/」= 明示无总价限价
  } else if (yuanValues.size === 1) {
    facts.ceilingWan = [...yuanValues][0]! / 10_000;
  } else if (yuanValues.size > 1 || /最高限价[(（]元[)）]/.test(nfkcFull)) {
    facts.ceilingWan = null;
  } else {
    facts.ceilingWan = labeledAmount(blob, /最高限价(?!单价)(?:（如有）)?|控制价|拦标价/);
  }
  if (/磋商保证金[：:]\s*无/.test(blob) || /投标保证金[：:]\s*(?:无|0(?:\.0+)?\s*(?:万元?)?)/.test(blob)
    || /保证金[：:]\s*(?:无|0(?:\.0+)?\s*(?:万元?)?)/.test(blob)) {
    facts.depositWan = 0;
  } else if (/不[收取需]{1,2}投标保证金|不收取投标保证金/.test(blob)) {
    facts.depositWan = null;
  } else {
    facts.depositWan = labeledAmount(blob, /投标保证金金额|保证金金额[：:]|投标保证金[：:]|磋商保证金[：:]|保证金[：:]/);
  }
  facts.depositForms = extractDepositForms(nearKeyword(blob, /保证金|缴纳形式/, 80).join("\n") || blob);

  facts.deadline = pickDateTime(blob, "deadline")
    ?? normalizeDateTime(
      firstLineValue(blob, /(?:提交|递交).{0,16}截止时间[：:]\s*(\S[^\n]{0,80})/)
      || firstLineValue(blob, /投标截止时间[：:]\s*(\S[^\n]{0,80})/)
      || sameLineSpacedValue(blob, /(?:提交|递交).{0,16}截止时间/)
      || sameLineSpacedValue(blob, /投标截止时间/)
      || sameLineSpacedValue(blob, /递交截止时间/)
      || nextLineAfterLabel(blob, /(?:提交|递交).{0,16}截止时间/)
      || nextLineAfterLabel(blob, /投标截止时间/)
      || nextLineAfterLabel(blob, /递交截止时间/)
      || nextLineAfterLabel(blob, /截止时间/),
    );
  // 开标时间：优先显式标注（开标时间/开启时间）；招标惯例 开标时间=递交截止时间——
  // 但只在全文确有开标/开启语境时才兜底用 deadline（只写截止时间的公告不补开标）。
  facts.openAt = pickDateTime(blob, "open") ?? (/开标|开启/.test(blob) ? facts.deadline : null);
  facts.openPlace = firstLineValue(blob, /开标地点[：:]\s*(\S[^\n]{0,80})/)
    || nextLineAfterLabel(blob, /开标地点/);
  facts.serviceTerm = firstLineValue(blob, /服务期限[：:]\s*(\S[^\n]{0,80})/)
    || nextLineAfterLabel(blob, /服务期限/);

  const qualSections = sections.filter((section) => QUAL_HEADING.test(section.heading) && titleish(section.heading));
  const qualWindow = blob.match(/申请人的资格要求|投标人的资格要求|资格要求[：:][\s\S]*?(?=\n[三四五]、|获取招标文件|获取采购文件|$)/);
  const qualBlob = qualSections.length > 0
    ? clauseBlobs(sections, qualSections)
    : (qualWindow?.[0] ?? "");
  const quals: Qualification[] = [];
  for (const item of splitQualificationItems(qualBlob)) {
    const sec = sectionOf(item.text, qualSections) ?? qualSections[0];
    const where = locator(relOf(sec), sec?.page, item.text);
    quals.push({
      id: `q${item.id}`,
      text: item.text,
      hard: isHardQualification(item.text, qualBlob, item.id),
      category: classifyQualification(item.text),
      ...(where === undefined ? {} : { where }),
    });
  }
  if (quals.length === 0) {
    for (const line of `${qualBlob}\n${blob}`.split(/\r?\n/)) {
      const hit = line.match(/资格要求[：:]\s*(.+)/);
      const text = hit?.[1]?.trim() ?? "";
      if (text === "") continue;
      const sec = sectionOf(text);
      const where = locator(relOf(sec), sec?.page, text);
      quals.push({
        id: "q1",
        text: text.endsWith("。") ? text : `${text}。`,
        hard: true,
        category: classifyQualification(text),
        ...(where === undefined ? {} : { where }),
      });
    }
  }
  facts.qualifications = quals;

  const scoreSections = sectionsMatching(sections, /评标办法|评分办法|评分明细|评分/);
  const scoring: ScoringItem[] = [];
  // 结构化评分表先行（RB-19）：竖线表/分栏压扁表按行列结构抽，提纲式 `name（N分）`
  // 只在评分章节范围内开（评分章被子标题切碎时也要把整章区间纳进来）；collectScoring 殿后补漏。
  const scoreBlob = scoreSections.map((section) => `${section.heading}\n${section.body}`).join("\n");
  // 章目录行（`第三章 …\t- 24 -`）body 为空会抢 first-match——评分章起点要正文非空的那条
  const isScoreSection = (section: (typeof sections)[number]) => /评标办法|评分办法|评分明细|评审方法|评分/.test(section.heading) || /评标办法|评分办法|评分明细|评审方法|评分/.test(section.body.slice(0, 40));
  const scoreStart = sections.findIndex((section) => isScoreSection(section) && section.body.trim() !== "");
  const scoreEnd = scoreStart < 0 ? -1 : sections.findIndex((section, index) => index > scoreStart && /^第[一二三四五六七八九十\d]+(?:章|节|编|部分)/.test(section.heading) && section.body.trim() !== "");
  const inlineBlob = scoreStart < 0
    ? scoreBlob
    : sections.slice(scoreStart, scoreEnd < 0 ? sections.length : scoreEnd).map((section) => `${section.heading}\n${section.body}`).join("\n");
  const structured = [
    ...scoringFromTableText(inlineBlob, relPath, { inline: true }),
    ...scoringFromTableText(fullBlob, relPath),
  ];
  for (const item of structured) {
    if (scoring.some((got) => got.item === item.item)) continue;
    const sec = sectionOf(item.item, scoreSections) ?? (scoreStart >= 0 ? sections[scoreStart] : undefined);
    scoring.push({ ...item, id: `s${scoring.length + 1}`, where: locator(relOf(sec), sec?.page ?? item.where?.page, item.item) });
  }
  let part: ScoringItem["part"] = "其他";
  for (const section of scoreSections) {
    part = currentPart(section.heading, part);
    for (const parsed of collectScoring(section.body.split(/\r?\n/), part)) {
      if (scoring.some((item) => item.item === parsed.item && item.maxScore === parsed.maxScore)) continue;
      scoring.push({ ...parsed, id: `s${scoring.length + 1}`, where: locator(relOf(section), section.page, parsed.item) });
    }
  }
  facts.scoring = scoring;
  const scoreSum = scoring.reduce((sum, item) => sum + item.maxScore, 0);
  if (scoring.length > 0) {
    const declared = inferDeclaredTotal(blob, scoring.map((item) => item.maxScore));
    if (declared === undefined) {
      facts.notes.push(`招标文件未写总分或满分，评分表合计 ${scoreSum} 分，请核对是否完整。`);
    } else if (Math.abs(scoreSum - declared) > 0.001) {
      facts.notes.push(`评分表合计 ${scoreSum} 分，不等于招标文件总分 ${declared} 分，请核对。`);
    }
  }

  const rejectSections = sectionsMatching(sections, /废标条款|否决其投标|无效投标|不予接收|不予受理/);
  const rejectBlob = clauseBlobs(sections, rejectSections);
  const rejects: RejectionClause[] = [];
  // 判定词集放宽（RB-26）：废标块里「视为无效/按无效投标处理/不予接收/不予受理」
  // 与「否决其投标/作废标」同义，不能只认四种旧词形；但仍只取废标/否决语境块内的条款。
  // BL-90：补「予以废标/将被拒绝」——国采中心文件的废标条（28. 采购项目废标）
  // 与★/MAC 雷同条款用这两种词形。
  const REJECTION_VERDICT = /否决其投标|视为无效|作废标|按废标|予以废标|无效投标|无效标|投标无效|不予受理|不予接收|予以拒绝|将被拒绝|被拒绝/;
  const rejectItems = numberedItems(rejectBlob, "paren").filter((item) => REJECTION_VERDICT.test(item.text));
  let sourceItems = rejectItems.length > 0
    ? rejectItems
    : splitSentences(rejectBlob)
      .filter((sentence) => REJECTION_VERDICT.test(sentence))
      .map((sentence, index) => ({ id: String(index + 1), text: sentence }));
  // BL-90：废标条款常内嵌在「投标人须知」内部编号条（如「28. 采购项目废标」），
  // 没有独立废标节时 rejectBlob 为空——退回全文判定句（回避/程序性句仍被滤掉）。
  if (sourceItems.length === 0) {
    sourceItems = splitSentences(blob)
      .filter((sentence) => REJECTION_VERDICT.test(sentence))
      .map((sentence, index) => ({ id: String(index + 1), text: sentence }));
  }
  for (const item of sourceItems) {
    if (/利害关系|回避/.test(item.text)) continue;
    const text = item.text.replace(/\s+/g, "").length === item.text.replace(/\s+/g, "").length
      ? (item.text.endsWith("。") ? item.text : `${item.text}。`)
      : item.text;
    const sec = sectionOf(text, rejectSections) ?? rejectSections[0];
    rejects.push({
      id: `r${rejects.length + 1}`,
      text,
      where: locator(relOf(sec), sec?.page, text),
    });
  }
  facts.rejectionClauses = rejects;

  const techSections = sectionsMatching(sections, /技术要求|技术规格|服务要求|技术要点/);
  const techBlob = clauseBlobs(sections, techSections);
  const techNumbered = numberedItems(techBlob, "paren");
  if (techNumbered.length > 0) {
    facts.technicalKeyPoints = techNumbered.slice(0, 30).map((item) => item.text);
  } else {
    facts.technicalKeyPoints = techBlob
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\d+\.\d+\s+/, ""))
      .filter((line) => line.length >= 12 && !/^4\.\d+$/.test(line) && !/建设目标|验收|培训/.test(line) && !isTableHeaderLine(line))
      .slice(0, 30);
  }

  facts.proposalStructure = extractProposalStructure(sections, blob);

  const contactLines = blob.split(/\r?\n/).map((line) => line.trim()).filter((line) => {
    if (line === "" || /账号|开户|账\s*号/.test(line)) return false;
    return /(?:联系人|联系方式|联系电话|电\s*话)\s*[：:].+/.test(line);
  }).map((line) => line.slice(0, 80));
  facts.contacts = [...new Set(contactLines)].slice(0, 8);

  const quotedQuals = quoteQualifications(projectId, blob, fullBlob);
  if (quotedQuals !== null) {
    facts.qualifications = quotedQuals.map((text, index) => {
      const sec = sectionOf(text);
      const where = locator(relOf(sec), sec?.page, text);
      return {
        id: `q${index + 1}`,
        text,
        hard: true,
        category: classifyQualification(text),
        ...(where === undefined ? {} : { where }),
      };
    });
    const soft = quoteSoftFields(fullBlob);
    // 引用名单只在结构化抽取没拿到分值时兜底——抽出真实评分表（带分）时以真实表为准（RB-19/RB-23）。
    if (facts.scoring.filter((item) => item.maxScore > 0).length < 2) {
      facts.scoring = soft.scoring.map((item, index) => {
        const sec = sectionOf(item);
        const where = locator(relOf(sec), sec?.page, item);
        return {
          id: `s${index + 1}`,
          part: /报价|价格/.test(item) ? "价格" : /技术|方案|参数|服务/.test(item) ? "技术" : "商务",
          item,
          maxScore: 0,
          basis: item,
          ...(where === undefined ? {} : { where }),
        };
      });
    }
    facts.rejectionClauses = soft.rejection.map((text, index) => {
      const sec = sectionOf(text);
      const where = locator(relOf(sec), sec?.page, text);
      return { id: `r${index + 1}`, text, ...(where === undefined ? {} : { where }) };
    });
    facts.technicalKeyPoints = soft.technical;
    if (facts.proposalStructure.length === 0 && soft.structure.length > 0) {
      facts.proposalStructure = soft.structure;
    }
  }

  // J-1 关键日程：硬日期抽出来跟着 facts 走；submitEnd/openAt 不在此列（由 compose 时补）。
  const keyDates = extractKeyDates(blob);
  if (keyDates.length > 0) facts.keyDates = keyDates;
  // J-3 递交方式：电子/纸质、平台、客户端、CA/解密——整条抽不到就留 undefined。
  const route = extractSubmissionRoute(blob);
  if (route !== null) facts.submissionRoute = route;
  // K-3 法规体系与公告期限：质疑/异议窗口的起算点；判不出体系留 其他 不猜。
  const regime = extractRegimeSignals(blob);
  facts.legalRegime = regime.legalRegime;
  facts.procurementMethod = regime.procurementMethod;
  facts.noticePeriodWorkdays = regime.noticePeriodWorkdays;
  facts.publishedAt = regime.publishedAt;

  facts.sourceFiles = [...sourceFiles];
  const confidence = { ...facts.confidence };
  for (const field of TENDER_FACT_FIELDS) {
    confidence[field] = fieldConfidence(facts[field]);
  }
  facts.confidence = confidence;
  return facts;
}

const FACT_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function assertClock(field: string, value: unknown): void {
  if ((field === "deadline" || field === "openAt") && value !== null && (typeof value !== "string" || !FACT_CLOCK.test(value))) {
    throw new Error(`${field} 必须是 YYYY-MM-DDTHH:mm 或 null`);
  }
}

export function mergeMissingPatch(base: TenderFacts, patch: Partial<Record<TenderFactField, unknown>>): TenderFacts {
  const next = { ...base, confidence: { ...base.confidence } };
  for (const field of TENDER_FACT_FIELDS) {
    if (!(field in patch)) continue;
    const stored = (base as Record<string, unknown>)[field];
    const storedBad = (field === "deadline" || field === "openAt") && stored !== null && (typeof stored !== "string" || !FACT_CLOCK.test(stored));
    if (base.confidence[field] !== "missing" && !storedBad) {
      throw new Error(`拒绝写入非 missing 字段：${field}`);
    }
    assertClock(field, patch[field]);
    (next as Record<string, unknown>)[field] = patch[field];
    next.confidence[field] = patch[field] === null ? "missing" : "model";
  }
  return next;
}

/** 用户修正：任何字段都可改，置信度记为 user；重新看标时保留（见 keepUserFields）。 */
export function mergeUserPatch(base: TenderFacts, patch: Partial<Record<TenderFactField, unknown>>): TenderFacts {
  const next = { ...base, confidence: { ...base.confidence } };
  for (const field of TENDER_FACT_FIELDS) {
    if (!(field in patch)) continue;
    assertClock(field, patch[field]);
    (next as Record<string, unknown>)[field] = patch[field];
    next.confidence[field] = patch[field] === null || patch[field] === "" ? "missing" : "user";
  }
  return next;
}

/** 重新抽取后，把上一版里用户修正过的字段搬回来。 */
export function keepUserFields(fresh: TenderFacts, previous: TenderFacts | undefined): TenderFacts {
  if (previous === undefined) return fresh;
  const next = { ...fresh, confidence: { ...fresh.confidence } };
  for (const field of TENDER_FACT_FIELDS) {
    if (previous.confidence[field] !== "user") continue;
    (next as Record<string, unknown>)[field] = (previous as Record<string, unknown>)[field];
    next.confidence[field] = "user";
  }
  return next;
}
