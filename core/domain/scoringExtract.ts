// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import type { DocTable } from "../docExtract.ts";
import type { ScoringItem } from "./tenderFacts.ts";

/**
 * 评分办法结构化：真实招标文件的评分表多是「序号｜评分项｜评分标准｜分值」或「评审内容｜分值｜评审标准」。
 * docx 读原生表格；PDF 按「名称 … N分」切分。每项再拆出「至少包含…」的要素和扣分规则，供写标书与自检使用。
 */

export interface ScoringDetail extends ScoringItem {
  /** 评分标准要求包含的要素（「至少包含人员安排、进度计划…」）。 */
  elements: string[];
  /** 扣分 / 得分规则原文（「每出现1处瑕疵减2分」「每有一份业绩合同加2分」）。 */
  rules: string[];
  /** 客观分（有无、数量）还是主观分（方案优劣）。 */
  objective: boolean;
}

function partOf(section: string, name: string, basis: string): ScoringItem["part"] {
  const text = `${section} ${name}`;
  if (/价格|报价/.test(name) || /^价格/.test(section)) return "价格";
  if (/业绩|财务|信誉|信用|资质|认证|荣誉|企业|注册资本|社保|纳税|保修|质保|节能|环境标志|中小企业/.test(name)) return "商务";
  if (/技术|参数|方案|培训|售后|服务|实施|安装|施工|供货|质量|安全|应急|组织|人员|团队|设计|样品|演示|响应/.test(text)) return "技术";
  if (/商务/.test(section)) return "商务";
  if (/技术|主观/.test(section)) return "技术";
  return /证书|报告|合同/.test(basis) ? "商务" : "其他";
}

const ELEMENT_RE = /(?:至少|应当?|须|需要?)(?:包含|包括|涵盖)([^。；;\n]{2,160})/;

export function rubricElements(basis: string): string[] {
  const m = ELEMENT_RE.exec(basis.replace(/\s+/g, ""));
  if (m === null) return numberedElements(basis);
  return m[1]!
    .replace(/[等及以及和]*(内容|方面|要求)?$/, "")
    .split(/[、，,；;]|以及|及|和/)
    .map((item) => item.replace(/^(针对本项目的|本项目的|投标人)/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 20);
}

/**
 * 真实评分标准常写成「内容包括但不限于：1项目重难点分析…；2系统兼容性…；…5个方面分别进行评审」。
 * 只在出现「包括/包含/涵盖」后的带序号清单时拆，序号少于 2 项不算清单。
 */
function numberedElements(basis: string): string[] {
  const text = basis.replace(/\s+/g, "");
  const start = /(?:包括|包含|涵盖)(?:但不限于)?[:：]?/.exec(text);
  if (start === null) return [];
  const tail = text.slice(start.index + start[0].length).split(/[。]|[，,]?\d+个方面|[，,:：]?以上/)[0] ?? "";
  const items = tail
    .split(/[；;]|[，,](?=[（(]?\d{1,2}[)）.、．]?[^\d])/)
    .map((item) => item.replace(/^[（(]?\d{1,2}[)）.、．]?/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 30);
  return items.length >= 2 ? items : [];
}

const GENERIC_ELEMENT_WORDS = /方案|措施|计划|分析|针对性|解决|保障|进行|项目|本项目|全系统|具体|相关|内容|情况|说明|及其|及|和|与|的/g;

/**
 * 评分要素在正文里是否写到：要素拆成核心词，过半核心词写到即算（评委按要点找，不要求原句复现）。
 * 核心词按双字片段比对，「系统兼容性」与正文「系统兼容与接口适配」算写到；片段 ≥ 60% 出现才算。
 */
export function elementCovered(element: string, text: string): boolean {
  const body = text.replace(/\s+/g, "");
  const terms = element
    .split(/[、，,/]|以及/)
    .map((part) => part.replace(GENERIC_ELEMENT_WORDS, ""))
    .filter((part) => part.length >= 2);
  if (terms.length === 0) return body.includes(element.replace(/\s+/g, ""));
  const termCovered = (term: string): boolean => {
    if (body.includes(term)) return true;
    const grams = Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2));
    return grams.filter((gram) => body.includes(gram)).length >= Math.ceil(grams.length * 0.6);
  };
  return terms.filter(termCovered).length * 2 >= terms.length;
}

/** 「每缺少一项扣2.2分」「缺一项扣2分」：取每缺一项的扣分；没写时返回 null，由调用方按满分均摊。 */
export function deductionPerMissing(basis: string): number | null {
  const m = /每?缺(?:少|失|漏)?(?:一|1)(?:项|个方面|个要素)[^扣减\d]{0,6}(?:扣|减)(?:除)?(\d+(?:\.\d+)?)分/.exec(basis.replace(/\s+/g, ""));
  return m === null ? null : Number(m[1]);
}

function rulesOf(basis: string): string[] {
  return basis
    .split(/[\n。；;]/)
    .map((line) => line.trim())
    .filter((line) => /(每|得|扣|减|加|最多|最低|满分|不得分|0分)/.test(line) && /分/.test(line))
    .slice(0, 6);
}

function scoreOf(cell: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*分?\s*$/.exec(cell);
  return m === null ? null : Number(m[1]);
}

function detail(id: string, part: ScoringItem["part"], item: string, maxScore: number, basis: string, where?: ScoringItem["where"], kindHint?: "客观" | "主观"): ScoringDetail {
  const elements = rubricElements(basis);
  return {
    id,
    part,
    item: item.replace(/\s+/g, ""),
    maxScore,
    basis: basis.trim(),
    ...(where === undefined ? {} : { where }),
    elements,
    rules: rulesOf(basis),
    objective: kindHint === "客观" ? true : kindHint === "主观" ? false
      : !/方案|措施|计划|能力|设计|组织|培训|服务|承诺/.test(item) && elements.length === 0 && /提供|证书|合同|报告|每[个份项]|是否|得\d|加\d/.test(basis),
  };
}

/** facts.scoring 的 ScoringItem 还原成 ScoringDetail——矩阵派生的唯一入口（RB-23）。 */
export function scoringDetailOf(item: ScoringItem, kindHint?: "客观" | "主观"): ScoringDetail {
  return detail(item.id, item.part, item.item, item.maxScore, item.basis, item.where, kindHint);
}

export function scoringFromTables(tables: readonly DocTable[], relPath: string): ScoringDetail[] {
  const out: ScoringDetail[] = [];
  const FLAG_CELL_RE = /^(?:是|否|客观分?|主观分?|暗标|明标|—|-|\/|分)$/;
  for (const table of tables) {
    const flat = table.map((row) => row.join(" ")).join("\n");
    if (!/分值|评分标准|评审标准|评分因素|评分内容|评审内容/.test(flat)) continue;
    if (/单价|投标应答|偏离/.test(flat.slice(0, 200))) continue;
    let section = "";
    let nameCol = -1;
    let basisCol = -1;
    let scoreCol = -1;
    let objCol = -1;
    const found: ScoringDetail[] = [];
    for (const row of table) {
      const cells = row.map((cell) => cell.trim());
      const joined = cells.join(" ");
      // 识别表头行并记住「评审因素/评分项」「评分标准」「分值」「是否客观分」列位（RB-19：避免多列属性表把序号当分值、把「否」当名称）
      const isHeaderRow = /^(序号|评分因素|评审内容|评分项|评审因素|评分项目)$/.test(cells[0] ?? "")
        || /^(分值|评分标准|评审因素|评分项|评分内容)$/.test(cells[1] ?? "");
      if (isHeaderRow) {
        cells.forEach((cell, idx) => {
          if (nameCol < 0 && /^(?:评审因素|评分因素|评分项|评分项目|评审内容|评分内容|评审项)$/.test(cell)) nameCol = idx;
          if (basisCol < 0 && /(?:评分标准|评审标准|标准说明|评审细则|评分细则)/.test(cell)) basisCol = idx;
          if (scoreCol < 0 && /^(?:分值|分数|满分|权重|分值\(分\)|分值（分）)$/.test(cell)) scoreCol = idx;
          if (objCol < 0 && /(?:是否客观分|客观分|评分性质|评审性质)/.test(cell)) objCol = idx;
        });
        continue;
      }
      const sectionHead = /^(第[一二三四五六七八九十]部分)?\s*([^\d（(]{2,12})[（(](\d+(?:\.\d+)?)\s*分[）)]/.exec(cells[0] ?? "");
      if (sectionHead !== null && cells.slice(1).every((cell) => cell === "" || /分值|评分标准|评审标准/.test(cell))) {
        section = sectionHead[2]!.trim();
        continue;
      }
      if (/^[一二三四五六七八九十]+$/.test(cells[0] ?? "") && cells[1] && /(?:报价|价格|商务|技术|服务|综合).*部分/.test(cells[1])) {
        section = cells[1].trim();
        continue;
      }
      const scores = cells.map((cell) => scoreOf(cell));
      const hasLaterScore = scores.some((n, i) => i > 0 && n !== null);
      const scoreIdx = (scoreCol >= 0 && scoreCol < cells.length && scores[scoreCol] !== null)
        ? scoreCol
        : scores.findIndex((n, i) => n !== null && !(i === 0 && /^\d{1,2}$/.test(cells[0]!) && hasLaterScore));
      if (scoreIdx < 0) continue;
      const max = scores[scoreIdx]!;
      let name = "";
      let basis = "";
      if (nameCol >= 0 && nameCol !== scoreIdx && cells[nameCol] && !FLAG_CELL_RE.test(cells[nameCol]!)) {
        name = cells[nameCol]!;
      }
      if (basisCol >= 0 && basisCol !== scoreIdx && cells[basisCol]) {
        basis = cells[basisCol]!;
      }
      if (!name || !basis) {
        const textCells = cells.filter((cell, i) => i !== scoreIdx && i !== objCol && cell !== "" && !/^\d{1,2}$/.test(cell) && !FLAG_CELL_RE.test(cell));
        if (textCells.length === 0) continue;
        const sorted = [...textCells].sort((a, b) => a.length - b.length);
        if (!name) name = sorted[0]!;
        if (!basis) basis = textCells.length > 1 ? sorted[sorted.length - 1]! : "";
      }
      if (name.length > 40 || max <= 0 || max > 100) continue;
      const objCell = objCol >= 0 ? (cells[objCol] ?? "") : "";
      const kindHint: "客观" | "主观" | undefined = objCell === "是" || /^客观/.test(objCell)
        ? "客观"
        : objCell === "否" || /^主观/.test(objCell)
          ? "主观"
          : undefined;
      found.push(detail(`s${out.length + found.length + 1}`, partOf(section, name, basis), name, max, basis, { relPath }, kindHint));
      void joined;
    }
    if (found.length >= 2) out.push(...found);
  }
  return out;
}

/** PDF 文本：评分区里「名称 N分」行（名称可能折成多行）。 */
export function scoringFromText(text: string, relPath: string): ScoringDetail[] {
  const direct = [...text.matchAll(/(评审内容|评分因素|评分项目?|评审项目|评分内容)\s*(分值|分数)/g)].map((m) => m.index ?? 0);
  const titled = [...text.matchAll(/(评分办法及评分规则|评标办法|评分标准|综合评分法)/g)].map((m) => m.index ?? 0)
    .filter((index) => !/[.…·]{4,}/.test(text.slice(index, index + 80)));
  const start = direct.length > 0 ? Math.max(0, direct[0]! - 2000) : titled[0] ?? -1;
  if (start < 0) return [];
  const region = text.slice(start, start + 40_000).replace(/\f/g, "\n").replace(/,?\s*\d{1,4}\s*\/\s*\d{1,4}\s*(?=\n)/g, "\n");
  const lines = region.split("\n").map((line) => line.trim());
  const out: ScoringDetail[] = [];
  let section = "";
  type Open = { name: string; max: number; basis: string[] };
  let open: Open | null = null;
  const flush = () => {
    if (open === null) return;
    const basis = open.basis.join("\n");
    out.push(detail(`s${out.length + 1}`, partOf(section, open.name, basis), open.name, open.max, basis, { relPath }));
    open = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const head = /^(\d\.\d)?\s*(商务|技术|价格|服务)(部分|分)?\s*$/.exec(line) ?? /^2\.\d\s*(商务|技术)部分/.exec(line);
    if (head !== null) { flush(); section = head[2] ?? head[1] ?? ""; continue; }
    const m = /^(.{0,14}?)\s*(\d+(?:\.\d+)?)\s*分$/.exec(line);
    if (m !== null && !/[，。；、]/.test(m[1] ?? "") && Number(m[2]) > 0 && Number(m[2]) <= 60) {
      // 名称可能在上面 1–3 行（「重要技术\n参数」）
      let name = (m[1] ?? "").trim();
      let j = i - 1;
      while (j >= 0 && name.length < 12 && (lines[j] ?? "").length > 0 && (lines[j] ?? "").length <= 6 && !/[，。；：]/.test(lines[j]!) && !/分$/.test(lines[j]!)) {
        name = `${lines[j]}${name}`;
        if (open !== null && open.basis.length > 0 && open.basis[open.basis.length - 1] === lines[j]) open.basis.pop();
        j -= 1;
      }
      if (name.replace(/\s/g, "").length >= 2 && !/^(评审内容|分值|评审标准)/.test(name)) {
        flush();
        open = { name, max: Number(m[2]), basis: [] };
        continue;
      }
    }
    if (open !== null) {
      if (/^(\d\.\d|第[一二三四五六七八九十]+章|[三四五六七八九]、|3\.\s*定标|评标委员会推荐)/.test(line) && open.basis.length > 3) { flush(); continue; }
      open.basis.push(line);
    }
  }
  flush();
  const total = out.reduce((sum, item) => sum + item.maxScore, 0);
  return out.length >= 2 && total >= 50 && total <= 120 ? out : [];
}

export function extractScoring(docs: ReadonlyArray<{ relPath: string; text: string; tables?: DocTable[] }>): ScoringDetail[] {
  let best: ScoringDetail[] = [];
  for (const doc of docs) {
    const fromTables = scoringFromTables(doc.tables ?? [], doc.relPath);
    const total = fromTables.reduce((sum, item) => sum + item.maxScore, 0);
    if (fromTables.length > best.length && total >= 50 && total <= 120) best = fromTables;
  }
  if (best.length === 0) {
    for (const doc of docs) {
      const structured = scoringFromTableText(doc.text, doc.relPath, { inline: true });
      const fromText = scoringFromText(doc.text, doc.relPath);
      const merged = structured.length >= fromText.length ? structured : fromText;
      const total = merged.reduce((sum, item) => sum + item.maxScore, 0);
      if (merged.length > best.length && (total === 0 || (total >= 50 && total <= 200))) best = merged;
    }
  }
  return best.map((item, index) => ({ ...item, id: `s${index + 1}` }));
}

/* ================= 结构化评分表（RB-19/RB-23）=================
 * 不靠章名正则，只认「表头行列结构 + 名分绑定」：
 *  A) 竖线表：`序号 | 评审因素 | 评审标准 | 分值`（real-067/083），行以 `N |` 起、`| N` 收尾；
 *  B) PDF 分栏压扁：两三短行覆盖 序号/评审因素/评审项/评审标准/分值（real-009/001），
 *     组以 `N 因素名`+`（N分）` 起，项以短行名 + 标准段 + `N分`/`N.N（…）` 收尾；
 *  C) 提纲式：`（二）检测服务方案（52分）`、`1.…比较（10分）` 名分绑定行（real-065）。
 * 「（1）…得5分」分档是项内评分细则，算 basis 不算评分项。
 */

interface RawScore {
  name: string;
  maxScore: number;
  basis: string;
  /** 组名（商务部分/技术部分/客观分/主观分）——part 与客观/主观判定的上下文。 */
  group: string;
}

const SCORE_COL_NAME = /评审因素|评标因素|评分因素|评审项|评分项|评审内容|评分内容|类别/;
const SCORE_COL_VALUE = /^分值|^分数|评审项分值|^满分|评分标准|评审标准|客观分|细化和量化/;
const SCORE_INLINE = /[（(](\d{1,3}(?:\.\d+)?)\s*分[）)]/;
/** 组名是「桶」而不是评分项：商务部分/技术部分/客观分/主观分/价格/服务方案组不适用最后一类。 */
const GENERIC_GROUP = /^(?:商务|技术|价格|服务|报价|综合|客观分|主观分)(?:部分)?$|^[（(](?:客观|主观)分/;
const SCORE_FOOTER = /^[\u4e00-\u9fff]{0,8}[明暗]标\d*$|^第\s*\d+\s*页\s*$|^评标方法和评标标准$|^(?:详细)?评审标准$|^评分明细$/;
const LIST_PREFIX = /^[（(]?[一二三四五六七八九十\d]{1,3}[）).、]\s*/;

function pipeCellsOf(line: string): string[] {
  const cells = line.split("|").map((cell) => cell.replace(/\s+/g, " ").trim());
  if (cells[0] === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/** 竖线表头：单元格里同时出现 因素/评审项/项目 类列名与 分值/满分/标准 列名（分值也可藏在 `name（N分）` 格里）。 */
function isPipeScoreHeader(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = pipeCellsOf(line);
  const hasName = cells.some((cell) => SCORE_COL_NAME.test(cell) || /^项目$/.test(cell));
  const hasScore = cells.some((cell) => SCORE_COL_VALUE.test(cell));
  return hasName && hasScore;
}

/** 压扁表头：相邻 ≤4 行覆盖 ≥2 个结构词且含「分值」。返回表体起始行，不是表头回 -1。 */
function collapsedHeaderEnd(lines: readonly string[], at: number): number {
  const window = lines.slice(at, at + 4).map((line) => line.replace(/\s+/g, ""));
  if (!window.some((line) => /评审因素|评标因素|评分因素|评审项|评分项|类别/.test(line))) return -1;
  if (!window.some((line) => /分值|评分标准说明|评审标准|评分标准/.test(line))) return -1;
  let end = at;
  for (let k = at; k < Math.min(lines.length, at + 4); k += 1) {
    const compact = (lines[k] ?? "").replace(/\s+/g, "");
    if (compact === "" || compact.length > 60) break;
    if (/序号|评审因素|评标因素|评分因素|评审项|评分项|类别|分值|评审标准|评分标准|评分标准说明|审查/.test(compact)) end = k + 1;
    else break;
  }
  return end;
}

/** `name（N分）` 名分绑定：剥掉行首序号/圈号/（一）式前标，返回名字与分值。 */
function inlineScoreOf(line: string): { name: string; score: number } | null {
  const at = line.search(SCORE_INLINE);
  if (at < 0) return null;
  const name = line.slice(0, at).replace(LIST_PREFIX, "").replace(/^[①-⑩⑪-⑳]\s*/, "").trim();
  const m = SCORE_INLINE.exec(line.slice(at));
  if (m === null || name === "" || name.length > 60) return null;
  return { name, score: Number(m[1]) };
}

/** 行尾分值线：`30分`、`30`、`30.0（0.0-`、`2.0（0,1,2）`。返回分值与行内残余（脚注/组标）。 */
function scoreTerminatorOf(line: string): { score: number; rest: string; openParen: boolean } | null {
  const m = /^(\d{1,3}(?:\.\d+)?)\s*分?\s*(.*)$/.exec(line);
  if (m === null) return null;
  const rest = m[2] ?? "";
  if (rest !== "" && !/^（/.test(rest)) return null;
  return { score: Number(m[1]), rest, openParen: /（[^）]*$/.test(rest) };
}

/** `N分` 行是项内「得N分」断行的续尾而不是行尾分值：上一行以 得/扣/加/减/至/为/满/每/（ 收尾。 */
function continuesTierSentence(prevLine: string): boolean {
  return /[得扣加减至为满每评打：:，、（(]$/.test(prevLine.trim());
}

/** 短行才算评分项名（≤16 字、无句读）；多 token 行取不含 评审/标准/因素/分值 的首 token；纯分值串（5分、（30分））不算名。 */
function nameTokenOf(line: string): string {
  const tokens = line.split(/\s+/).filter((token) => token !== "");
  const clean = tokens.filter((token) => !/^\d+$/.test(token)
    && !/^[（(]?\d{1,3}(?:\.\d+)?\s*分?[）)]?$/.test(token)
    && !/评审|标准|因素|分值/.test(token));
  return (clean[0] ?? "").replace(LIST_PREFIX, "").trim();
}

function isNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.length > 16) return false;
  if (/[。；，：、,;:（(]/.test(trimmed)) return false;
  return nameTokenOf(trimmed) !== "";
}

function kindHintOf(group: string): "客观" | "主观" | undefined {
  if (/主观/.test(group)) return "主观";
  if (/客观/.test(group)) return "客观";
  return undefined;
}

/** 压扁表：组行 `N 因素名` + `（N分）`；项名是首个标准行之前 1–3 个连续短行；`N分`/`N.N（…）` 收尾。 */
function parseCollapsedBlock(lines: readonly string[], from: number): { rows: RawScore[]; next: number } {
  const rows: RawScore[] = [];
  let group: { name: string; score: number | null } | null = null;
  /** names=分值线前的连续短行；locked=已进入标准段前的候选名；basis=评分标准原文。 */
  let names: string[] = [];
  let locked: string[] = [];
  let basis: string[] = [];
  const swallowParens = (start: string, at: number): number => {
    let depth = (start.match(/（/g) ?? []).length - (start.match(/）/g) ?? []).length;
    let i = at;
    while (depth > 0 && i + 1 < lines.length) {
      i += 1;
      const more = lines[i] ?? "";
      depth += (more.match(/（/g) ?? []).length - (more.match(/）/g) ?? []).length;
    }
    return i;
  };
  const flush = (score: number) => {
    const picked = names.length > 0 ? names : locked;
    let name = picked.map(nameTokenOf).join("");
    if (group !== null && !GENERIC_GROUP.test(group.name)
      && (name === "" || (group.score === score && (group.name.includes(name) || name.length <= 4)))) {
      name = group.name;
    }
    if (name !== "") rows.push({ name, maxScore: score, basis: basis.join("\n"), group: group?.name ?? "" });
    names = [];
    locked = [];
    basis = [];
  };
  const reset = () => { names = []; locked = []; basis = []; };
  let i = from;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    const prev = (lines[i - 1] ?? "").trim();
    // 组行：`1 投标报价`、`2 商务部分`
    const rowHead = /^(\d{1,2})\s+(\S.{0,24})$/.exec(line);
    const groupScore = /^[（(](\d{1,3}(?:\.\d+)?)\s*分[）)]\s*(.*)$/.exec(line);
    if (rowHead !== null && !SCORE_FOOTER.test(rowHead[2] ?? "") && names.length + locked.length + basis.length === 0) {
      group = { name: nameTokenOf(rowHead[2] ?? ""), score: null };
      reset();
      i += 1;
      continue;
    }
    if (groupScore !== null && names.length + locked.length === 0) {
      // `（30分） 报价`：组总分 + 首个评审项名；`（57分） 技术参数` 同理
      if (group !== null) group.score = Number(groupScore[1]);
      else group = { name: "", score: Number(groupScore[1]) };
      const rest = (groupScore[2] ?? "").trim();
      if (rest !== "" && isNameLine(rest)) names = [rest];
      i += 1;
      continue;
    }
    const term = scoreTerminatorOf(line);
    if (term !== null && names.length + locked.length > 0 && !continuesTierSentence(prev)) {
      flush(term.score);
      // 行内残余：未闭合括号续行、`主观分（技`组标、章节脚注
      if (term.openParen) { i = swallowParens(term.rest, i); i += 1; continue; }
      const rest = term.rest.replace(/^[）)]?[\d.,\-]*[）)]?\s*/, "").trim();
      const marker = /^[（(]?(客观分|主观分)/.exec(rest);
      if (marker !== null) {
        group = { name: marker[1]!, score: null };
        i = swallowParens(rest, i);
      }
      // 裸分值行（`3.0`）后面的独立区间尾巴 `（0,1,2）` 吞掉，防它变成下一项的名字
      if (rest === "" && /^[（(][\d.,\-]+[）)]\s*$/.test((lines[i + 1] ?? "").trim())) i += 1;
      i += 1;
      continue;
    }
    if (term !== null && term.openParen && names.length + locked.length === 0) { i = swallowParens(term.rest, i); i += 1; continue; }
    if (SCORE_FOOTER.test(line) || /^合计/.test(line) || /^\d{1,4}$/.test(line)) { i += 1; continue; }
    // `客观分（商`/`主观分（技` 组标行：吞到括号闭合，记组上下文
    const marker = /^[（(]?(客观分|主观分)/.exec(line);
    if (marker !== null) {
      group = { name: marker[1]!, score: null };
      reset();
      i = swallowParens(line, i);
      i += 1;
      continue;
    }
    const bound = inlineScoreOf(line);
    if (bound !== null && bound.name.length <= 30) {
      reset();
      rows.push({ name: bound.name, maxScore: bound.score, basis: "", group: group?.name ?? "" });
      i += 1;
      continue;
    }
    // 表结束：无进行中项时遇到枚举/章节/附件行
    if (names.length + locked.length === 0 && /^(?:\d+[.、]|[一二三四五六七八九十]+、|附[件录]|第[一二三四五六七八九十\d]+(?:章|节|编|部分))/.test(line)) break;
    if (isNameLine(line)) {
      if (names.length + locked.length === 0 || locked.length === 0) names.push(line);
      else basis.push(line);
    } else {
      if (names.length > 0) { locked = names; names = []; }
      basis.push(line);
    }
    i += 1;
  }
  return { rows, next: i };
}

/** `name（N分）` 绑定名：`（` 前取到最后一段硬断句（；：。\n|），再按 `，`/`、` 碎片从右向左
 *  合并到括号平衡——`…扣完为止；单项内容分` 得 单项内容分，`…措施（a，b、c等）比较` 保完整名。 */
function cleanBoundName(raw: string): string {
  const seg = (raw.split(/[。；：！？|]/).filter((part) => part.trim() !== "").pop() ?? "").trim();
  const parts = seg.split(/(，|、)/);
  let picked = (parts[parts.length - 1] ?? "").trim();
  const unbalance = (frag: string) => (frag.match(/）/g) ?? []).length - (frag.match(/（/g) ?? []).length;
  let balance = unbalance(picked);
  for (let k = parts.length - 2; k >= 0 && balance > 0; k -= 1) {
    picked = parts[k]! + picked;
    balance += unbalance(parts[k]!);
  }
  const name = picked.replace(LIST_PREFIX, "").replace(/^[①-⑩⑪-⑳]\s*/, "").replace(/\s+/g, "").trim();
  if (name.length < 2 || name.length > 40) return "";
  if (/[。；：！？!?;:|]/.test(name)) return "";
  // `，`/`、` 只允许出现在括号内部（`措施（a，b、c等）比较`）；裸句读说明裁到句中，丢。
  if (/[，、]/.test(name) && !/（[^）]*[，、][^）]*）/.test(name)) return "";
  if (/^\d/.test(name) || /得|扣|最|每/.test(name)) return "";
  return name;
}

/**
 * 竖线表按「格」抽：每个 `name（N分）` 绑定格都是一个评分项（组标 `商务部分（49分）`、
 * 项名 `仓储管理方案（9分）`、依据里的 `单项内容分（2分）` 都按 corpus 原样记）；
 * 无绑定分的短名格（`投标报价`、`投标评审价格`）吃行尾分值格；`是/否` 等哑格不记。
 * record 以 `N |`、`组名（N分） |`、`（N分） |`（名看前面裸名行）起。
 */
function parsePipeBlock(lines: readonly string[], from: number): { rows: RawScore[]; next: number } {
  const records: string[][] = [];
  let current: string[] | null = null;
  let pendingName = "";
  let i = from;
  for (; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (line === "" || SCORE_FOOTER.test(line)) continue;
    // 表结束：合计/总计/总分/加分尾巴行、章节/附件行；`4. 未提供不得分` 这类项内短句收进 record 当依据。
    if (/^(合计|总计|总分|小计|加分项|共计)/.test(line) || /^[一二三四五六七八九十]+[、.]/.test(line) || /^第[一二三四五六七八九十\d]+(?:章|节|编|部分)/.test(line)) break;
    if (line.includes("|")) {
      const cells = pipeCellsOf(line);
      const first = cells[0] ?? "";
      if (/^(合计|总计|总分|小计|加分项|共计)/.test(first)) break;
      // 表内又出现一张评分表头（`分值（100分）` 会在第二遍表头里）——让主循环重新接管
      if (isPipeScoreHeader(line)) break;
      const nameScoreLead = /^[^\n|]*\S[^\n|（(]*[（(]\d{1,3}(?:\.\d+)?\s*分[）)]/.test(first);
      const pureScoreLead = /^[（(]\d{1,3}(?:\.\d+)?\s*分[）)]\s*$/.test(first);
      // 中文数字也是行号：`一 | 投标报价部分` 这类组行不打断表（real-061/085）。
      if (/^(?:\d+|[一二三四五六七八九十]+)$/.test(first) || nameScoreLead || (pureScoreLead && current === null)) {
        current = [pureScoreLead && pendingName !== "" ? `${pendingName} ${line}` : line];
        records.push(current);
      } else {
        if (current === null) break;
        // 非分值领头的短词满格行 = 下一张表的表头（分包号 | 中队名称 | …）；
        // 但只要带 `name（N分）`/`（N分）` 分值格或裸分值格，它就是本表续行。
        const hasScoreCell = cells.some((cell) => SCORE_INLINE.test(cell) || /^\d{1,3}(?:\.\d+)?\s*分?$/.test(cell));
        const headerLike = cells.length >= 3 && !/^\d/.test(first) && !hasScoreCell && cells.every((cell) => cell.length <= 30);
        if (headerLike) break;
        current.push(line);
      }
      pendingName = "";
      continue;
    }
    if (isNameLine(line)) {
      pendingName = line;
      if (current !== null) current.push(line);
      continue;
    }
    pendingName = "";
    if (current !== null) current.push(line);
  }
  const rows: RawScore[] = [];
  const emitted = new Set<string>();
  const push = (name: string, score: number, basis: string, group: string) => {
    // 合计/加分尾巴不是评分项；单项分值必在 1–100。
    if (name === "" || emitted.has(name) || /^(?:总分|合计|小计|共计|加分项)/.test(name) || !(score > 0 && score <= 100)) return;
    emitted.add(name);
    rows.push({ name, maxScore: score, basis, group });
  };
  for (const rec of records) {
    const cells = rec.join("\n").split("|")
      .map((cell) => cell.trim())
      .filter((cell, index) => !(index === 0 && /^\d+$/.test(cell)) && cell !== "");
    if (cells.length === 0) continue;
    // 行分值格不限定在末格：`序号|评审因素|分项|分值|评分标准` 的分值在中间列。
    const scoreIdx = cells.reduce((acc, cell, index) => (/^\d{1,3}(?:\.\d+)?\s*分?$/.test(cell) ? index : acc), -1);
    const rowScore = scoreIdx >= 0 ? Number((cells[scoreIdx] ?? "").replace(/\s*分$/, "")) : null;
    const scan = scoreIdx >= 0 ? cells.filter((_, index) => index !== scoreIdx) : cells;
    let group = "";
    for (const [index, cell] of scan.entries()) {
      const marks = [...cell.matchAll(/[（(](\d{1,3}(?:\.\d+)?)\s*分[）)]/g)]
        .map((m) => ({ name: cleanBoundName(cell.slice(0, m.index)), score: Number(m[1]) }))
        .filter((row) => row.name !== "");
      for (const mark of marks) {
        push(mark.name, mark.score, scan.slice(index + 1).join("\n"), group);
        if (GENERIC_GROUP.test(mark.name) || /部分|评分|因素/.test(mark.name)) group = mark.name;
      }
      const joined = cell.replace(/\s+/g, "");
      if (marks.length === 0 && rowScore !== null && isNameLine(joined) && !/^(是|否)$/.test(joined) && !GENERIC_GROUP.test(joined)) {
        push(joined, rowScore, scan.slice(index + 1).join("\n"), group);
      }
    }
  }
  return { rows, next: i };
}

/** 提纲行：`（一）价格分（15分）`、`1.…比较（10分）`、`①name（N分）`。 */
function outlineScoreOf(line: string): { name: string; score: number } | null {
  const hit = inlineScoreOf(line);
  if (hit === null) return null;
  if (!/^[（(]?[一二三四五六七八九十\d]+[）).、]|^[①-⑩]|^\d+[.、]/.test(line.trim())) return null;
  return hit;
}

/**
 * 评分表结构化抽取入口。text 应是评分区文字（评分章/附件正文）；
 * inline=true 时再收提纲式 `name（N分）` 行（仅建议用于评分章节文字，防正文误捕）。
 */
export function scoringFromTableText(text: string, relPath: string, options: { inline?: boolean } = {}): ScoringDetail[] {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const rows: RawScore[] = [];
  const seen = new Set<string>();
  const pushAll = (found: RawScore[]) => {
    for (const row of found) {
      const key = row.name.replace(/\s+/g, "");
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  };
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (isPipeScoreHeader(line)) {
      const block = parsePipeBlock(lines, i + 1);
      pushAll(block.rows);
      i = Math.max(block.next, i + 1);
      continue;
    }
    const headEnd = collapsedHeaderEnd(lines, i);
    if (headEnd > i) {
      const block = parseCollapsedBlock(lines, headEnd);
      pushAll(block.rows);
      i = Math.max(block.next, headEnd);
      continue;
    }
    if (options.inline === true) {
      const outline = outlineScoreOf(line);
      if (outline !== null) pushAll([{ name: outline.name, maxScore: outline.score, basis: "", group: "" }]);
    }
    i += 1;
  }
  return rows.map((row, index) => detail(
    `s${index + 1}`,
    partOf(row.group, row.name, row.basis),
    row.name,
    row.maxScore,
    row.basis,
    { relPath },
    kindHintOf(row.group),
  ));
}
