// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import type { DocTable } from "../docExtract.ts";
import type { FactLocator } from "./tenderFacts.ts";

/**
 * 采购需求（设备清单）结构化：厨房设备招标的核心。
 *
 * 招标文件里的「采购需求一览表 / 采购清单 / 技术参数」一般是一张大表：序号｜名称｜技术参数｜数量｜单位｜备注。
 * docx / xlsx 直接读表格；PDF 没有表格结构，按「序号. 名称 → 1、参数… → 数量 单位」的顺序切分。
 * 每条参数单独拆出来，带标记（★ * ▲ ● ◆ ■）、数值比较（≥ 1.2mm）、尺寸、材质、要提供的证明材料。
 */

export type MarkRole = "substantive" | "important" | "scored" | "core";

/** 业务语义：goods/service 是采购标的，obligation 是资格/评分/格式/废标等响应义务。
 *  旧数据没有 kind，按采购标的兼容。 */
export type RequirementKind = "goods" | "service" | "obligation";

export interface MarkLegend {
  /** 实质性（负偏离即无效投标）。 */
  substantive: string[];
  /** 重要参数（扣分）。 */
  important: string[];
  /** 需要证明材料才得分的参数。 */
  scored: string[];
  /** 主要标的 / 核心产品。 */
  core: string[];
}

export type ParamOp = "≥" | "≤" | ">" | "<" | "=" | "约" | "范围";

export interface ReqParam {
  no: string;
  text: string;
  marks: string[];
  key?: string;
  op?: ParamOp;
  value?: number;
  value2?: number;
  unit?: string;
  /** 尺寸（mm），如 1200×500×1800。 */
  dims?: number[];
  /** 材质，如 304 / 201。 */
  material?: string;
  /** 要求提供的证明材料（证书、检测报告、承诺函…）。 */
  evidence?: string;
}

export interface RequirementItem {
  id: string;
  no: string;
  name: string;
  qty: number | null;
  unit: string;
  params: ReqParam[];
  /** 名称上的标记（如 ▲ 核心产品）。 */
  marks: string[];
  spec: string;
  location: string;
  where?: { relPath: string; page?: number };
  /** 采购标的或响应义务；缺省视为采购标的。 */
  kind?: RequirementKind;
}

/** 只有采购标的进入选型、报价和技术偏离；义务只进合规矩阵/要求核对。 */
export function isPricedRequirement(item: RequirementItem): boolean {
  return item.kind !== "obligation";
}

/** Q-01：facts 方式生成的条目全部是义务；旧数据没有 kind 时按义务处理，避免继续污染报价。 */
export function pricedRequirements(result: RequirementsResult): RequirementItem[] {
  return result.items.filter((item) => (result.method === "facts" && item.kind === undefined ? false : isPricedRequirement(item)));
}

export interface RequirementsResult {
  items: RequirementItem[];
  legend: MarkLegend;
  /** 从哪里抽取：table = 原生表格；text = PDF 文本切分；facts = 无设备表时由资格/评分/废标/格式条款合成。 */
  method: "table" | "text" | "facts" | "none";
  notes: string[];
}

const MARK_CHARS = "★*＊▲●◆■#△☆";
const MARK_RE = /[★*＊▲●◆■#△☆]/g;
const UNITS = "台|个|件|辆|套|项|组|只|张|把|批|樘|扇|块|根|副|对|条|座|m2|㎡|平方米|m|米|延米|kg|吨|桶|箱|樽|盏|部|间";

/** 从「关于采购需求的说明」等段落识别各标记的含义；识别不到时按行业惯例。 */
export function detectLegend(text: string): MarkLegend {
  const legend: MarkLegend = { substantive: [], important: [], scored: [], core: [] };
  const sentences = text.replace(/\s+/g, "").split(/[。；;\n]/);
  const find = (mark: string) => sentences.filter((s) => s.includes(mark));
  const normalized = (mark: string) => (mark === "＊" ? "*" : mark);
  for (const mark of ["★", "*", "＊", "▲", "●", "◆", "■", "#", "△", "☆"]) {
    const about = find(`“${mark}”`).concat(find(`"${mark}"`), find(`${mark}号`), find(`标注${mark}`), find(`加注${mark}`));
    const joined = about.join("。");
    if (joined === "") continue;
    const m = normalized(mark);
    if (/实质性|不允许偏离|无效投标|否决|废标|必须满足/.test(joined)) legend.substantive.push(m);
    else if (/主要标的|核心产品/.test(joined)) legend.core.push(m);
    else if (/证明|检测|报告|得分|技术支撑/.test(joined)) legend.scored.push(m);
    else if (/重要|关键/.test(joined)) legend.important.push(m);
  }
  if (legend.substantive.length === 0) legend.substantive.push("★");
  if (!legend.core.includes("▲") && !legend.substantive.includes("▲") && !legend.important.includes("▲")) {
    // 政府采购文件里 ▲ 多数表示核心产品或重要参数；没说明时当重要参数。
    legend.important.push("▲");
  }
  return { substantive: [...new Set(legend.substantive)], important: [...new Set(legend.important)], scored: [...new Set(legend.scored)], core: [...new Set(legend.core)] };
}

export function markRole(mark: string, legend: MarkLegend): MarkRole | null {
  if (legend.substantive.includes(mark)) return "substantive";
  if (legend.core.includes(mark)) return "core";
  if (legend.scored.includes(mark)) return "scored";
  if (legend.important.includes(mark)) return "important";
  return null;
}

export function isSubstantive(param: Pick<ReqParam, "marks">, legend: MarkLegend): boolean {
  return param.marks.some((mark) => legend.substantive.includes(mark));
}

const OPS: Array<[RegExp, ParamOp]> = [
  [/^(≥|>=|大于等于|大于或等于|不低于|不少于|不小于|至少|最低)/, "≥"],
  [/^(≤|<=|小于等于|小于或等于|不高于|不大于|不超过|最高|最大)/, "≤"],
  [/^(＞|>|大于|高于|超过)/, ">"],
  [/^(＜|<|小于|低于)/, "<"],
  [/^(约|大约|左右)/, "约"],
  [/^(=|＝|为)/, "="],
];

const UNIT_RE = /^(mm|cm|m³\/h|m3\/h|m³\/H|m³|m3|kw|kW|KW|w|W|kva|V|v|A|L|l|升|kg\/h|Kg\/h|KG\/h|个\/h|个\/小时|碟\/小时|kg|Kg|KG|g|℃|°C|°|度|寸|MPa|Pa|pa|%|h|小时|分钟|min|年|m\/min|米\/分钟|dB|db|mg\/m³|Hz|HZ|人|层|盘|头|门|格|mm²)/;

function parseNumber(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** 招标文件常把长×宽×高写成一串数字，例如 12005001800 = 1200×500×1800。 */
export function splitPackedDims(digits: string): number[] | null {
  if (!/^\d{9,12}$/.test(digits)) return null;
  const found: number[][] = [];
  const walk = (rest: string, acc: number[]): void => {
    if (acc.length === 3) {
      if (rest === "") found.push(acc);
      return;
    }
    for (const len of [4, 3]) {
      if (rest.length < len) continue;
      const value = Number(rest.slice(0, len));
      if (value < 100 || value > 9999) continue;
      walk(rest.slice(len), [...acc, value]);
    }
  };
  walk(digits, []);
  if (found.length === 0) return null;
  const score = (parts: number[]): number => parts.reduce((sum, value) => sum + (value >= 200 && value <= 4000 ? 10 : value < 200 ? -8 : 0), 0);
  return found.sort((left, right) => score(right) - score(left))[0] ?? null;
}

/** 从一条参数文字里拆出：关键词、比较符、数值、单位、尺寸、材质、证明材料。 */
export function parseParam(no: string, raw: string, marks: string[] = []): ReqParam {
  const text = raw.replace(/\s+/g, " ").trim();
  const param: ReqParam = { no, text, marks };
  const flat = text.replace(/\s+/g, "");
  const dims = /(\d{2,6}(?:\.\d+)?)[×xX*＊](\d{2,6}(?:\.\d+)?)(?:[×xX*＊](\d{2,6}(?:\.\d+)?)(?:\/(\d{2,4}))?)?/.exec(flat);
  if (dims !== null && /尺寸|规格|外形|mm|长|宽|高|L=/.test(flat)) {
    param.dims = [dims[1], dims[2], dims[3]].filter((v): v is string => v !== undefined).map(Number);
    param.key = "尺寸";
    const before = flat.slice(0, dims.index);
    param.op = /(≥|不低于|不小于|大于等于)$/.test(before) ? "≥" : /(≤|不大于|不超过)$/.test(before) ? "≤" : /参考|约/.test(before) || /参考/.test(flat) ? "约" : "=";
    param.unit = "mm";
  }
  if (param.dims === undefined && /尺寸|规格|外形/.test(flat)) {
    const packed = /(\d{9,12})(?:mm)?/.exec(flat);
    const parts = packed === null ? null : splitPackedDims(packed[1] ?? "");
    if (parts !== null) {
      param.dims = parts;
      param.key = "尺寸";
      param.unit = "mm";
      param.op = /≥|>=|大于等于|不低于|不小于/.test(flat) ? "≥" : /≤|<=|不大于|不超过/.test(flat) ? "≤" : "=";
    }
  }
  const material = /(SUS)?\s?(304|316L?|201|430)(?:#|号)?(?:\/2B)?\s*(?:优质)?不锈钢|不锈钢[^，。；]{0,6}?(304|316L?|201|430)|SUS(304|316L?|201|430)/i.exec(text);
  if (material !== null) param.material = (material[2] ?? material[3] ?? material[4] ?? "").toUpperCase();
  if (param.dims === undefined) {
    const m = /([^\d≥≤><＞＜=＝约：:，,；;。]{1,16}?)[：:]?\s*(≥|>=|≤|<=|＞|＜|>|<|大于等于|大于或等于|小于等于|不低于|不少于|不小于|不高于|不大于|不超过|大于|小于|高于|低于|约|=|＝|为)?\s*[φΦ∅Ø]?\s*(\d+(?:\.\d+)?)\s*(?:[-~～至]\s*(\d+(?:\.\d+)?))?\s*([a-zA-Z³/℃°%寸升层盘头门格人度小时分钟年碟个]+)?/.exec(text);
    if (m !== null) {
      const key = (m[1] ?? "").replace(/^[\d、.．\s]+/, "").replace(/(采用|用|为|的|是|达到|应)$/g, "").trim();
      const opText = m[2] ?? "";
      const unitText = m[5] ?? "";
      const unit = UNIT_RE.exec(unitText)?.[0];
      if (key !== "" && (unit !== undefined || opText !== "")) {
        param.key = key;
        const v1 = parseNumber(m[3] ?? "");
        if (v1 !== undefined) param.value = v1;
        const v2 = m[4] === undefined ? undefined : parseNumber(m[4]);
        if (v2 !== undefined) { param.value2 = v2; param.op = "范围"; }
        else param.op = OPS.find(([re]) => re.test(opText))?.[1] ?? "=";
        if (param.op === "=" && /约/.test(text.slice(0, (m.index ?? 0) + (m[0]?.length ?? 0)))) param.op = "约";
        const after = text.slice((m.index ?? 0) + (m[0]?.length ?? 0), (m.index ?? 0) + (m[0]?.length ?? 0) + 4);
        if (param.op === "=" && /^(以上|及以上|或以上)/.test(after)) param.op = "≥";
        if (param.op === "=" && /^(以下|及以下|或以下|以内)/.test(after)) param.op = "≤";
        if (unit !== undefined) param.unit = unit;
      }
    }
  }
  const evidence = /(需|须|应|并)?提供[^。；;]{2,80}/.exec(text) ?? /(CMA|3C|CCC|检测报告|认证证书|备案凭证|卫生许可证|型式批准证书|彩页|承诺函)[^。；;]{0,40}/.exec(text);
  if (evidence !== null) param.evidence = evidence[0].replace(/^(需|须|应|并)/, "").trim();
  return param;
}

const PARAM_START = new RegExp(`^\\s*([${MARK_CHARS}]*)\\s*[（(]?(\\d{1,2})\\s*[、.．)）](?!\\d)\\s*([${MARK_CHARS}]*)`);

/** 把一段技术参数文字拆成逐条参数；续行并到上一条。 */
export function splitParams(spec: string): ReqParam[] {
  const lines = spec.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const chunks: Array<{ no: string; marks: string[]; text: string }> = [];
  for (const line of lines) {
    const m = PARAM_START.exec(line);
    if (m !== null) {
      const marks = `${m[1] ?? ""}${m[3] ?? ""}`.replace(/＊/g, "*").split("").filter(Boolean);
      chunks.push({ no: m[2] ?? String(chunks.length + 1), marks, text: line.slice(m[0].length).trim() });
      continue;
    }
    const lead = new RegExp(`^([${MARK_CHARS}]+)\\s*`).exec(line);
    if (lead !== null && chunks.length > 0 && line.length > 6) {
      chunks.push({ no: String(chunks.length + 1), marks: lead[1]!.replace(/＊/g, "*").split(""), text: line.slice(lead[0].length) });
      continue;
    }
    const last = chunks[chunks.length - 1];
    // 没编号但上一条已以句号 / 分号收尾：另起一条（很多清单参数不编号，一行一条）。
    if (last === undefined || /[；;。]$/.test(last.text.trim())) chunks.push({ no: String(chunks.length + 1), marks: [], text: line });
    else last.text += line;
  }
  return chunks.filter((chunk) => chunk.text.trim() !== "").map((chunk) => parseParam(chunk.no, chunk.text, chunk.marks));
}

function nameMarks(raw: string): { name: string; marks: string[] } {
  const marks = [...raw.matchAll(MARK_RE)].map((m) => (m[0] === "＊" ? "*" : m[0]));
  const name = raw.replace(MARK_RE, "").replace(/\s+/g, "").trim();
  return { name, marks: [...new Set(marks)] };
}

function columnIndex(header: readonly string[], patterns: readonly RegExp[]): number {
  for (const pattern of patterns) {
    const index = header.findIndex((cell) => pattern.test(cell.replace(/\s+/g, "")));
    if (index >= 0) return index;
  }
  return -1;
}

const NAME_COL = [/^(标的|设备|货物|产品|采购品目|品目)?名称$/, /名称/, /^品名$/, /^货物$/];
const SPEC_COL = [/技术参数|参数要求|需求条款|技术要求|技术规格|配置要求|规格及技术|规格型号|规格/, /参数|要求|配置|描述/];
const QTY_COL = [/^数量$/, /数量|采购量/];
const UNIT_COL = [/^(计量)?单位$/];
const NO_COL = [/^(序号|项号|编号)$/];
const LOC_COL = [/备注|位置|区域|安装地点|使用地点/];

/** 表头像不像设备清单：必须有名称列 + 参数列或数量列。 */
function requirementHeader(row: readonly string[]): { name: number; spec: number; qty: number; unit: number; no: number; loc: number } | null {
  const name = columnIndex(row, NAME_COL);
  const spec = columnIndex(row, SPEC_COL);
  const qty = columnIndex(row, QTY_COL);
  if (name < 0 || (spec < 0 && qty < 0)) return null;
  if (row.some((cell) => /单价|总价|投标应答|偏离|报价/.test(cell))) return null;
  return { name, spec: spec === name ? -1 : spec, qty, unit: columnIndex(row, UNIT_COL), no: columnIndex(row, NO_COL), loc: columnIndex(row, LOC_COL) };
}

function qtyOf(raw: string): { qty: number | null; unit: string } {
  const m = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})?`).exec(raw.replace(/\s+/g, ""));
  if (m === null) return { qty: null, unit: "" };
  return { qty: Number(m[1]), unit: m[2] ?? "" };
}

export function requirementsFromTables(tables: readonly DocTable[], relPath: string): RequirementItem[] {
  const items: RequirementItem[] = [];
  for (const table of tables) {
    const headerAt = table.findIndex((row, index) => index < 3 && requirementHeader(row) !== null);
    if (headerAt < 0) continue;
    const cols = requirementHeader(table[headerAt]!)!;
    for (const row of table.slice(headerAt + 1)) {
      const rawName = row[cols.name] ?? "";
      if (rawName.trim() === "" || requirementHeader(row) !== null) continue;
      if (/^(合计|小计|总计)/.test(rawName.trim())) continue;
      const { name, marks } = nameMarks(rawName);
      const spec = cols.spec >= 0 ? row[cols.spec] ?? "" : "";
      const qtyCell = cols.qty >= 0 ? row[cols.qty] ?? "" : "";
      const parsed = qtyOf(qtyCell);
      const unit = cols.unit >= 0 ? (row[cols.unit] ?? "").trim() : parsed.unit;
      const no = cols.no >= 0 ? (row[cols.no] ?? "").trim() : String(items.length + 1);
      items.push({
        id: `r${items.length + 1}`,
        no: no || String(items.length + 1),
        name,
        qty: parsed.qty,
        unit: unit || parsed.unit,
        params: splitParams(spec),
        marks,
        spec: spec.trim(),
        location: cols.loc >= 0 ? (row[cols.loc] ?? "").trim() : "",
        where: { relPath },
      });
    }
  }
  return items;
}

const REGION_START = /(采购需求一览表|采购清单|设备清单|货物清单|技术参数(?:及要求|要求)?表?|采购内容及技术要求|技术要求|用户需求书|需求一览表)/;
const REGION_END = /^(第[一二三四五六七八九十]+[章部分]|评标办法|评分办法|评分标准|综合评分|投标文件格式)/m;

/** PDF 文本：在需求区内按「N. 名称 → 参数 → 数量 单位」切分。 */
export function requirementsFromText(text: string, relPath: string, pages?: readonly string[]): RequirementItem[] {
  const start = (() => {
    const hits = [...text.matchAll(new RegExp(REGION_START, "g"))].map((m) => m.index ?? 0);
    // 取后面紧跟「序号 / 名称」表头的那一处
    return hits.find((index) => /序\s*号|名\s*称/.test(text.slice(index, index + 200))) ?? hits[0] ?? -1;
  })();
  if (start < 0) return [];
  const rest = text.slice(start);
  const endMatch = REGION_END.exec(rest.slice(200));
  const region = rest.slice(0, endMatch === null ? rest.length : endMatch.index + 200)
    // 页眉页脚（「,22 / 114」「第 3 页」）
    .replace(/,?\s*\d{1,4}\s*\/\s*\d{1,4}\s*(?=\n|$)/g, "\n")
    .replace(/\f/g, "\n");
  const lines = region.split("\n");
  type Seg = { no: number; lines: string[] };
  const segs: Seg[] = [];
  let expect = 1;
  const unitRe = new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?)\\s*(${UNITS})\\s+(?=(?:否|是)\\b|(?:否|是)\\s)`);
  // 数字被换行拆开（「13\n85 \nm2」「11\n.9\n6\nm」）时并回去；只并「整行都是数字」的下一行，不误并参数序号。
  const joinDigits = (value: string) => {
    let prev = "";
    let next = value;
    while (prev !== next) {
      prev = next;
      next = next.replace(/(\d\.?)[ \t]*\n[ \t]*(\.?\d+)(?=[ \t]*(?:\n|$))/g, "$1$2");
    }
    return next.replace(/(\d)[ \t]*\n[ \t]*(m2|m)(?=[ \t]|\n|$)/g, "$1 $2");
  };
  const hasQty = (seg: Seg | undefined) => seg !== undefined && unitRe.test(joinDigits(seg.lines.join("\n")));
  for (const line of lines) {
    // 设备序号用「N.」；参数序号多用「N、」，但也有「N.」——当前设备还没读到「数量 单位」时，同号的行按参数算。
    const m = /^\s*(\d{1,3})\s*[.．](?!\d)\s*(.*)$/.exec(line) ?? /^\s*(\d{1,3})\s*、\s*(.*)$/.exec(line);
    const current = segs[segs.length - 1];
    const startsItem = m !== null && Number(m[1]) === expect && (segs.length === 0 || hasQty(current))
      && !/^(参\s*考|尺\s*寸|额\s*定|功\s*率|采\s*用|台\s*面|材\s*质)/.test((m[2] ?? "").trim());
    if (startsItem) {
      segs.push({ no: expect, lines: [(m![2] ?? "").trim()] });
      expect += 1;
      continue;
    }
    if (current !== undefined) current.lines.push(line);
  }
  const items: RequirementItem[] = [];
  for (const seg of segs) {
    const joined = joinDigits(seg.lines.join("\n"));
    const firstParam = /(^|\n|\s)[★*＊▲●◆■]*\s*1\s*[、.．](?!\d)/.exec(joined) ?? /(^|\n)\s*[一1][、.．]\s*设备参数/.exec(joined);
    const namePart = firstParam === null ? joined.split("\n").slice(0, 3).join("") : joined.slice(0, firstParam.index);
    let body = firstParam === null ? joined : joined.slice(firstParam.index);
    const qtyMatch = unitRe.exec(body);
    let qty: number | null = null;
    let unit = "";
    let location = "";
    if (qtyMatch !== null) {
      qty = Number(qtyMatch[1]);
      unit = qtyMatch[2] ?? "";
      const tail = body.slice((qtyMatch.index ?? 0) + qtyMatch[0].length);
      body = body.slice(0, qtyMatch.index);
      // 表尾列：是否节能 / 环境标志 / 所属行业 / 标的性质 / 备注；逐字换行的「工\n业\n货\n物」去掉，剩下的是安装位置
      location = tail
        .replace(/^(\s*(否|是)\s*)+/, "")
        .replace(/(工\s*业|货\s*物|服\s*务|零\s*售\s*业|批\s*发\s*业)\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const { name, marks } = nameMarks(namePart.replace(/\n/g, ""));
    if (name === "") continue;
    const page = pages === undefined ? undefined : (() => {
      const probe = namePart.replace(/\s+/g, "").slice(0, 6);
      const index = pages.findIndex((p) => p.replace(/\s+/g, "").includes(probe));
      return index >= 0 ? index + 1 : undefined;
    })();
    items.push({
      id: `r${items.length + 1}`,
      no: String(seg.no),
      name,
      qty,
      unit,
      params: splitParams(body),
      marks,
      spec: body.trim(),
      location,
      where: { relPath, ...(page === undefined ? {} : { page }) },
    });
  }
  // 太少说明切错了：少于 3 条不采信
  return items.length >= 3 ? items : [];
}

export function extractRequirements(docs: ReadonlyArray<{ relPath: string; text: string; tables?: DocTable[]; pages?: string[] }>): RequirementsResult {
  const notes: string[] = [];
  const allText = docs.map((doc) => doc.text).join("\n");
  const legend = detectLegend(allText);
  let best: RequirementItem[] = [];
  let method: RequirementsResult["method"] = "none";
  for (const doc of docs) {
    const fromTables = requirementsFromTables(doc.tables ?? [], doc.relPath);
    if (fromTables.length > best.length) { best = fromTables; method = "table"; }
  }
  if (best.length === 0) {
    for (const doc of docs) {
      const fromText = requirementsFromText(doc.text, doc.relPath, doc.pages);
      if (fromText.length > best.length) { best = fromText; method = "text"; }
    }
  }
  if (best.length === 0) notes.push("没有找到设备清单（采购需求一览表）：招标文件可能还没放进 公告/，或清单在图片/扫描件里");
  const noQty = best.filter((item) => item.qty === null).length;
  if (noQty > 0) notes.push(`${noQty} 条设备没识别出数量，请核对`);
  best.forEach((item, index) => { item.id = `r${index + 1}`; });
  return { items: best, legend, method, notes };
}

/**
 * BL-231：软件/服务类招标通常没有「采购需求一览表」，但资格、评分、废标与格式条款本身就是
 * 可核对的要求。把它们合成为带原文定位的 requirement 条目，让要求矩阵和“点要求查原文”有输入。
 * 只在这三类事实都存在原文定位时使用；没有定位的条目不伪造 where。
 */
export function requirementsFromFacts(input: {
  qualifications?: ReadonlyArray<{ text: string; hard?: boolean | undefined; where?: FactLocator | undefined }>;
  rejectionClauses?: ReadonlyArray<{ text: string; where?: FactLocator | undefined }>;
  scoring?: ReadonlyArray<{ part: string; item: string; maxScore: number; basis: string; where?: FactLocator | undefined }>;
  formats?: ReadonlyArray<{ title: string; text: string; where?: FactLocator | undefined }>;
}): RequirementItem[] {
  const items: RequirementItem[] = [];
  const push = (kind: string, name: string, text: string, where?: FactLocator | undefined) => {
    const body = text.trim();
    if (body === "") return;
    const marks = [...new Set(body.match(MARK_RE) ?? [])];
    const locator: { relPath: string; page?: number } | undefined = where === undefined
      ? undefined
      : { relPath: where.relPath, ...(where.page === undefined ? {} : { page: where.page }) };
    items.push({
      id: `r${items.length + 1}`,
      no: String(items.length + 1),
      name: `${kind}：${name.replace(/\s+/g, " ").trim().slice(0, 60)}`,
      qty: null,
      unit: "",
      params: [{ no: "1", text: body, marks }],
      marks,
      spec: body,
      location: locator?.relPath ?? "",
      ...(locator === undefined ? {} : { where: locator }),
      kind: "obligation",
    });
  };
  for (const item of input.qualifications ?? []) push(item.hard === true ? "资格(硬性)" : "资格", item.text, item.text, item.where);
  for (const item of input.rejectionClauses ?? []) push("废标", item.text, item.text, item.where);
  for (const item of input.scoring ?? []) push("评分", `${item.part}·${item.item}（${item.maxScore}分）`, item.basis, item.where);
  for (const item of input.formats ?? []) {
    const text = item.text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    push("格式", item.title, text, item.where);
  }
  return items;
}

export function requirementStats(result: RequirementsResult): { items: number; params: number; substantive: number; evidence: number } {
  const params = result.items.flatMap((item) => item.params);
  return {
    items: result.items.length,
    params: params.length,
    substantive: params.filter((param) => isSubstantive(param, result.legend)).length,
    evidence: params.filter((param) => param.evidence !== undefined).length,
  };
}
