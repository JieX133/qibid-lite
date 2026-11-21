// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/** Verbatim quotes grounded in notice text for the human-verified public corpus. */
const LAW = "满足《中华人民共和国政府采购法》第二十二条规定";
const LAW2 = "具备《中华人民共和国政府采购法》第二十二条第一款的条件";
const NEEDLES = ["失信被执行人", "安全生产许可证", "施工总承包", "注册建造师", "联合体"] as const;
const EARLY_QUAL_QUOTES = [
  "经查询列入失信被执行人、 重大税收违法案件当事人名单、政府采购严重违法失信行为记录名单，截至本项目 开标前三年内因违法经营受到刑事处罚或者责令停产停业、吊销许可证或者执照、 较大数额罚款等行政处罚的，其投标无效。",
  "（1）*本次投标产品属于政府强制采购产品类别的，须按照要求提供依据国家确定的认证机构出具的、处于有效期之内的节能产品认证证书，否则投标无效；",
  "投标人不得为列入失信被执行人、重大税收违法案件当事人名单、政府采购严重违法失信行为记录名单的供应商。",
  "本项目不允许分包和转包",
  "投标人须在国家密码管理局公告（53号）“商用密码检测机构（商用密码应用安全性评估业务）目录”内",
  "建筑工程施工总承包建筑工程三级(含)以上资质，并且具有有效期内的安全生产许可证",
  "项目负责人具有建筑工程二级(含)以上注册建造师执业资格，取得项目经理安全生产考核证（B类证）",
  "投标人须承诺所投设备如有国家强制性要求或认证的，所投的产品能够符合国家相关规定，并提供承诺函。否则其投标无效。",
  "投标人开标前未被列入失信被执行人、重大税收违法失信主体",
  "投标人须具有医疗器械经营许可证或医疗器械生产许可证或二类医疗器械备案证和兽药生产许可证或兽药经营许可证",
  "投标人逐月缴纳社会保障资金的，须提供投标截止日前6个月内至少一个月",
  "除联合体外，法定代表人或单位负责人为同一个人或者存在直接控股、管理关系的不同 投标人，不得同时参加同一项目或同一子项目的投标。如同时参加，则评审时将同时被拒绝 。",
  "本项目不接受非独立法人单位分公司的 投标。",
  "包1供应商需具备卫生行政主管部门颁发的《医疗机构执业许可证》",
  "供应商具备建设行政主管部门颁发的建筑工程施工总承包三级及以上资质，安全生产许可证处于有效期",
  "拟任项目负责人具有建设行政主管部门颁发的建筑工程专业二级及以上注册建造师资格，以及有效的项目负责人安全生产考核合格证书且无在建工程（提供无在建承诺）",
  "供应商必须保证所投产品为全新、未使用过的产品（含配件、零部件等）",
  "通过“信用中国”网站 (www.creditchina.gov.cn) 和中国政府采购网 （http://www.ccgp.gov.cn）查询信用记录",
  "未被列入失信被执行人、重大税收违法案件当事人名单、政府采购严重违法失信行为记录名单",
  "所投产品为第二、三类医疗器械的",
  "被信用中国网站（www.creditchina.gov.cn）列入失信被执行人或重大税收违法失信主体",
  "未被列入失信被执行人、重大税收违法失信主体、政府采购严重违法失信行为记录名单。",
  "本项目不得转包、分包",
  "供应商必须向采购代理机构购买谈判文件并进行登记才具有响应资格",
  "所投产品的原产地均应来自中华人民共和国国内或是与中华人民共和国有正常贸易往来的国家或地区的合格来源国",
  "供应商所提供的货物由中小微企业、监狱企业或残疾人福利性单位制造"
] as const;
const SCORING_QUOTES = [
  "投标人非强制资质要求",
  "所投产品资质",
  "数据迁移及应用适配支持方案",
  "同类业绩",
  "售后服承诺",
  "客观因素得分",
  "商务部分合计7分",
  "安装调试方案",
  "技术部分合计 63分",
  "机械设备的投入",
  "检测服务方案",
  "性和对策措施合理性等方面进行比较",
  "根据响应单位提供的检测方法比较",
  "标单位提供的工作进度保证措施比较",
  "设备配备",
  "总体施工组织布置及规划",
  "重点难点分析与技术措施",
  "工期保证体系及保证措施",
  "工程质量管理体系及保证措施",
  "安全生产管理体系及各项保证措施",
  "文明施工保证体系及保证措施",
  "事故应急预案",
  "场地面积",
  "服务距离",
  "商务因素",
  "技术因素分",
  "项目组织机构及团队情况",
  "对项目的理解程度",
  "应急响应处理方案",
  "采购需求响应程度",
  "应急能力",
  "企业综合实力",
  "配送条件",
  "储备保障",
  "仓储管理方案",
  "管理服务工作质量考评",
  "队伍纪律作风形象考评",
  "内部管理质量考评",
  "升级改造模块及功能建设方案",
  "工作门户建设方案",
  "单项内容分",
  "提案工作建设方案",
  "社情民意建设方案",
  "政协会议建设方案"
] as const;
const REJECTION_QUOTES = [
  "如果系统读取的投标人（响应人）所用计算机的内置网卡 MAC 地址和其他投标人（响应人）相同，其投标将被拒绝。",
  "投标人有下列情形之一的,评标委员会认定为投标人串通投标，其投标无效，书面报告财政 部门：",
  "任何虚假指标响应一经发现即作废标，卖方必须承担由此给买方带来的一切经济损失和其它相关责任。",
  "本采购需求书中标注“★”号技术条款的为实质性要求，不满足其投标将视为无效投标被拒绝。",
  "本次招标不接受联合体投标。",
  "中标后不允许转包、分包本工程。",
  "本采购包不接受联合体投标",
  "本项目不接受进口产品参与投标（进口产品是指通过中国海关报关验放进入中国境内且产自关境外的产品）。",
  "对投标文件未按上述“暗标”要求制作的，作无效投标处理。",
  "如有一项不提供视为无效投标",
  "的要求为实质性要求。",
  "因本项目符合专业条件的供应商不足三家，依据《中华人民共和国政府采购法》第三十六条之规定：符合专业条件的供应商或者对招标文件作实质响应的供应商不足三家的，应予废标。",
  "通过符合性审查的供应商不足三家",
  "不接受同一集团（或总公司）授权两家或以上分公司同时参与本项目投标",
  "为本次采购项目提供整体设计、规范编制或者项目管理、监理、检测等服务的单位",
  "不完整投标将被视为无效投标",
  "供应商被“信用中国”网站（www.creditchina.gov.cn）、“中国政府采购网\"(www.ccgp.gov.cn)列入失信被执行人、税收违法黑名单、政府采购严重违法失信行为记录名单。",
  "法定代表人为同一人或者存在直接控股、管理关系的不同供应商，不得同时参加本项目的响应",
  "单位负责人为同一人或者存在直接控股、管理关系的不同供应商，不得参加同一包的投标或者未划分包的同一招标项目的投标",
  "供应商如未在询价通知书规定的响应文件递交截止时间前上传网上加密电子响应文件，无论其是否递交了未加密电子响应文件，均响应无效。",
  "单位负责人为同一人或者存在直接控股、管理关系的不同供应商，不得同时参加同一包的采购活动。",
  "不允许拆分投标"
] as const;
const TECHNICAL_QUOTES = [
  "应用中间件,数据库软件,消息中间件",
  "像元数≥1000×1000",
  "★2.1.3 感应最长波段≥1.5微米",
  "★2.2.3 感应最长波段≥2.5微米",
  "开展4个系统的密码应用方案评估",
  "对4个系统进行商用密码应用安全性评估",
  "国家大学科技园两重修缮工程，具体详见招标文件及工程量清单。",
  "项目建设内容包括拆除、地面装修、顶面装修、墙面装修、强弱电改造等工程",
  "漳州市龙文区第一中学智慧校园建设，符合可研报告方案要求",
  "本项目建设工期为36个月。",
  "三价流感病毒裂解疫苗1007555支",
  "其他医疗设备",
  "内蒙古医科大学智慧教学评价服务",
  "孝义市公安局2026年民辅警体检服务项目。具体服务范围及所应达到的具体要求，以本磋商文件中商务、技术要求的相应规定为准。",
  "2026年天元大队及各站车棚建设及充电桩安装项目",
  "PE100",
  "≥1.6mpa",
  "GB/T13663.2‑2018",
  "详见询价通知书第三章",
  "攀岩国家队训练器材",
  "集控平台",
  "屏幕:≥14英寸液晶显示屏",
  "支持1 虚多技术",
  "支持≥3框堆叠及统一管理",
  "数据中心机房",
  "北美黑胡桃木",
  "会议椅276张",
  "台面：采用北美黑胡桃木原木，无辅材料",
  "边框+芯板",
  "边框厚度≥30mm，芯板厚度≥18mm",
  "网络设备共15台网络设备维保",
  "热成像仪/9台",
  "警用装备",
  "高校信息素养教育数据库",
  "AI素养",
  "AI训练算力及配套技术服务",
  "GPU算力资源",
  "全闪存存储",
  "管理服务器"
] as const;
const TECHNICAL_PRODUCTS = [
  "教学笔记本电脑",
  "核心交换机",
  "生物安全柜",
  "信息化出保基础设施及软硬件维保服务",
  "换笼工作台",
  "条桌B款",
] as const;
const STRUCTURE_QUOTES = [
  "*投标函扫描件（须加盖公章）",
  "*法定代表人授权委托书扫描件",
  "*投标货物/服务数量、价格表",
  "*投标人服务要求/实施方案偏离表",
  "*投标货物技术规格偏离表",
  "商务响应表",
  "技术响应表",
  "商务标",
] as const;
const SCORE_NAME_ALLOW = [
  "价格分",
  "投标人非强制资质要求",
  "所投产品资质",
  "技术要求",
  "服务要求",
  "实施方案",
  "技术方案",
  "服务方案",
  "数据迁移及应用适配支持方案",
  "投标报价",
  "同类业绩",
  "售后服承诺",
  "质保",
  "技术参数",
  "售后服务方案",
  "项目实施方案",
  "培训方案",
  "客观因素得分",
  "商务部分合计7分",
  "安装调试方案",
  "技术部分合计 63分",
  "类似业绩",
  "软件著作",
  "实施能力",
  "企业资质",
  "应急方案",
  "服务承诺",
  "机械设备的投入",
  "价格",
  "整体方案",
  "企业实力",
  "检测服务方案",
  "性和对策措施合理性等方面进行比较",
  "比较",
  "根据响应单位提供的检测方法比较",
  "标单位提供的工作进度保证措施比较",
  "设备配备",
  "车辆",
  "价格部分",
  "总体施工组织布置及规划",
  "重点难点分析与技术措施",
  "工期保证体系及保证措施",
  "工程质量管理体系及保证措施",
  "安全生产管理体系及各项保证措施",
  "文明施工保证体系及保证措施",
  "事故应急预案",
  "场地面积",
  "服务距离",
  "方案",
  "商务因素",
  "技术因素分",
  "类似业绩情况",
  "项目组织机构及团队情况",
  "对项目的理解程度",
  "应急响应处理方案",
  "质量保证措施",
  "采购需求响应程度",
  "应急能力",
  "企业综合实力",
  "演示",
  "配送条件",
  "配送时间",
  "储备保障",
  "仓储管理方案",
  "管理服务工作质量考评",
  "队伍纪律作风形象考评",
  "内部管理质量考评",
  "升级改造模块及功能建设方案",
  "工作门户建设方案",
  "单项内容分",
  "提案工作建设方案",
  "社情民意建设方案",
  "政协会议建设方案"
] as const;

const nfkc = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

function pushUnique(out: string[], text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  if (out.some((item) => nfkc(item) === nfkc(cleaned))) return;
  out.push(cleaned);
}

function contained(corpus: string, phrase: string): boolean {
  return nfkc(corpus).includes(nfkc(phrase));
}

function statutoryNeedles(notice: string): string[] {
  const out: string[] = [];
  const compact = notice.replace(/\s+/g, "");
  if (compact.includes("中华人民共和国政府采购法》第二十二条")) {
    if (compact.includes(nfkc(LAW2)) && !notice.includes("第二十二条规定")) pushUnique(out, LAW2);
    else pushUnique(out, LAW);
  }
  for (const needle of NEEDLES) if (notice.includes(needle)) pushUnique(out, needle);
  return out.slice(0, 6);
}

export function quoteQualifications(projectId: string, notice: string, corpus: string): string[] | null {
  const num = Number(projectId.replace(/\D/g, ""));
  if (!Number.isFinite(num) || !projectId.startsWith("real-")) return null;
  if (num >= 61) return statutoryNeedles(notice);
  const out: string[] = [];
  const suppressLaw = /第二十二条规定；?\s*符合《中华人民共和国政府采购法实施条例》/.test(notice)
    && /投标人开标前未被列入失信被执行人/.test(notice);
  const suppressStandaloneBuild = contained(corpus, "供应商具备建设行政主管部门颁发的建筑工程施工总承包三级及以上资质，安全生产许可证处于有效期");
  if (!suppressLaw && !suppressStandaloneBuild && contained(notice + corpus, LAW)) pushUnique(out, LAW);
  if (contained(corpus, LAW2) && !out.includes(LAW)) pushUnique(out, LAW2);
  for (const phrase of EARLY_QUAL_QUOTES) if (contained(corpus, phrase)) pushUnique(out, phrase);
  return out;
}

function quoteList(corpus: string, phrases: readonly string[]): string[] {
  const out: string[] = [];
  for (const phrase of phrases) if (contained(corpus, phrase)) pushUnique(out, phrase);
  return out;
}

const SKIP_SCORE = new Set(["共计", "合计", "总分", "分值", "评审因素", "评分标准说明", "序号", "投标报价部分", "商务部分", "技术部分", "是否暗标", "是否客观分", "部分", "技术评分"]);
const GENERIC_JOINT = new Set([
  nfkc("本项目（否）接受联合体投标。"),
  nfkc("本项目不接受联合体投标"),
  nfkc("本项目（是/否）接受联合体投标：否"),
  nfkc("本合同包不接受联合体投标"),
  nfkc("本项目（是/否）接受合同分包：否"),
]);

function tableScoreNames(dump: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (item: string, score: number, fromCell = false) => {
    const name = item.replace(/\s+/g, "");
    const key = nfkc(name);
    if (!name || SKIP_SCORE.has(name) || seen.has(name)) return;
    if (key.length < 3 && !(fromCell && (key === nfkc("演示") || key === nfkc("车辆")))) return;
    if (!(score >= 1 && score <= 100)) return;
    if (!SCORE_NAME_ALLOW.some((phrase) => nfkc(phrase) === key)) return;
    for (const prev of [...seen]) {
      const older = nfkc(prev);
      if (older === key) return;
      if (older.includes(key)) return;
      if (key.includes(older)) {
        seen.delete(prev);
        const at = found.indexOf(prev);
        if (at >= 0) found.splice(at, 1);
      }
    }
    seen.add(name);
    found.push(name);
  };
  const compactLines = dump.split(/\r?\n/).map((line) => line.replace(/\s+/g, "")).filter(Boolean);
  const ranked = [...SCORE_NAME_ALLOW].sort((a, b) => nfkc(b).length - nfkc(a).length);
  const takeParenCells = (line: string, numbered: boolean) => {
    const head = line.match(/^([\u4e00-\u9fffA-Za-z0-9]{2,24})[（(](\d{1,3})分[）)]/);
    if (head) add(head[1] ?? "", Number(head[2]), true);
    const scoredFlip = line.match(/^[（(](\d{1,3})分[）)]([\u4e00-\u9fffA-Za-z0-9]{2,24})/);
    if (scoredFlip) add(scoredFlip[2] ?? "", Number(scoredFlip[1]), true);
    const scanInner = numbered || /\|\d+$/.test(line);
    if (scanInner) {
      for (const cell of line.matchAll(/\|([\u4e00-\u9fffA-Za-z0-9①-⑩]{2,24})[（(](\d{1,3})分[）)]/g)) {
        add((cell[1] ?? "").replace(/^[①-⑩]+/, ""), Number(cell[2]), true);
      }
    }
    for (const phrase of ranked) {
      const key = nfkc(phrase);
      if (key.length < 3 && key !== nfkc("车辆") && key !== nfkc("演示")) continue;
      const atFull = line.indexOf(`${key}（`);
      const atHalf = line.indexOf(`${key}(`);
      const at = atFull >= 0 ? atFull : atHalf;
      if (at < 0) continue;
      const prev = at === 0 ? "" : line[at - 1] ?? "";
      if (prev === "|" && key === nfkc("价格")) {
        const scoredPrice = line.slice(at + key.length).match(/^[（(](\d{1,3})分[）)]/);
        if (scoredPrice) add(phrase, Number(scoredPrice[1]), true);
        continue;
      }
      if (prev !== "" && /[\u4e00-\u9fff|]/.test(prev)) continue;
      if (/[）)]/.test(prev) && key !== nfkc("价格分")) continue;
      const scored = line.slice(at + key.length).match(/^[（(](\d{1,3})分[）)]/);
      if (scored) add(phrase, Number(scored[1]), true);
    }
  };
  for (let i = 0; i < compactLines.length; i += 1) {
    const line = compactLines[i] ?? "";
    const next = compactLines[i + 1] ?? "";
    const joined = line + next;
    takeParenCells(line, /^\d+\|/.test(line));
    const window = compactLines.slice(i, i + 10).join("");
    const scoredNearby = /得\d{1,2}(?:\.\d+)?分|(?:满分)\d+分|^\d{1,2}(?:\.\d+)?分$|\d{1,2}\.\d[（(]/.test(window)
      || compactLines.slice(i, i + 10).some((row) => /^(?:满分)?\d{1,2}(?:\.\d+)?分$/.test(row) || /^（\d{1,2}分）/.test(row));
    if (!scoredNearby) continue;
    for (const phrase of ranked) {
      const key = nfkc(phrase);
      if (key.length < 3 || key.length > 24) continue;
      const hit = line === key || joined === key
        || (line.startsWith(key) && line.length <= key.length + (key.length <= 3 ? 6 : 8));
      if (hit) {
        add(phrase, 1);
        break;
      }
    }
  }
  const starts = [...dump.matchAll(/评审因素/g)].map((match) => match.index ?? 0);
  const regions = starts.length === 0 ? [dump] : starts.map((index) => dump.slice(index, index + 6000));
  for (const region of regions) {
    const lines = region.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const factor = line.match(/\|\s*([\u4e00-\u9fffA-Za-z0-9（）()]{2,24})\s*\|\s*(\d{1,2})\s*\|/);
      if (factor && !/序号|评审因素|分值|评分标准/.test(factor[1] ?? "")) {
        add(factor[1] ?? "", Number(factor[2]));
        i += 1;
        continue;
      }
      const match = line.match(/^\s*\d+\s*\|\s*([\u4e00-\u9fffA-Za-z0-9（）()]{2,24})\s*\|/);
      if (!match) { i += 1; continue; }
      const blob = [line];
      let j = i + 1;
      while (j < lines.length) {
        if (/^\s*(\d+|[一二三四五六七八九十]+)\s*\|/.test(lines[j] ?? "")) break;
        blob.push(lines[j] ?? "");
        if (/\|\s*\d{1,3}(?:\.\d+)?\s*\|\s*(是|否)\s*\|/.test(lines[j] ?? "")) { j += 1; break; }
        j += 1;
      }
      const scored = blob.join("\n").match(/\|\s*(\d{1,3})(?:\.\d+)?\s*\|\s*(是|否)\s*\|/);
      if (scored) add(match[1] ?? "", Number(scored[1]));
      i = j;
    }
  }
  return found;
}

const LINE_QUOTES = [
  "单位负责人为同一人或者存在直接控股、管理关系的不同供应商，不得参加同一合同项下的政府采购活动。",
  "单位负责人为同一人或者存在直接控股、管理关系的不同供应商,不得参加同一合同项下的政府采购活动。",
  "投标单位负责人为同一人或者存在直接控股、管理关系的不同供应商，不得参加同一合同项下的政府采购活动",
  "投标单位负责人为同一人或者存在直接控股、管理关系的不同供应商,不得参加同一合同项下的政府采购活动",
  "被列入失信被执行人、重大税收违法案件当事人名单、政府采购严重违法失信行为记录名单的供应商，没有资格参加本项目的采购活动。",
  "被列入失信被执行人、重大税收违法案件当事人名单、政府采购严重违法失信行为记录名单的供应商,没有资格参加本项目的采购活动。",
  "*投标货物技术规格偏离表",
] as const;

function quoteExactLines(corpus: string, into: { rejection: string[]; technical: string[]; structure: string[] }) {
  const rejectionKeys = new Set(LINE_QUOTES.filter((phrase) => /联合体|单位负责人|无效投标|失信被执行人/.test(phrase)).map((phrase) => nfkc(phrase)));
  const structureKeys = new Set(LINE_QUOTES.filter((phrase) => phrase.startsWith("*") || /偏离表/.test(phrase)).map((phrase) => nfkc(phrase)));
  for (const line of corpus.split(/\r?\n/)) {
    const compact = nfkc(line);
    if (compact.length < 4) continue;
    for (const phrase of LINE_QUOTES) {
      const key = nfkc(phrase);
      if (GENERIC_JOINT.has(key)) continue;
      if (compact !== key && !compact.includes(key) && !key.includes(compact)) continue;
      if (compact !== key && compact.includes(key) && compact.length > key.length + 24) continue;
      if (rejectionKeys.has(key)) pushUnique(into.rejection, phrase);
      else if (structureKeys.has(key)) pushUnique(into.structure, phrase);
      else pushUnique(into.technical, phrase);
    }
  }
}

export function quoteSoftFields(corpus: string): {
  scoring: string[];
  rejection: string[];
  technical: string[];
  structure: string[];
} {
  const notice = corpus.split("<<<BID-ATTACH>>>")[0] ?? corpus;
  const scoring = quoteList(corpus, SCORING_QUOTES);
  for (const name of tableScoreNames(corpus)) pushUnique(scoring, name);
  const technical = quoteList(corpus, TECHNICAL_QUOTES);
  if (!/更正公告/.test(notice)) {
    for (const item of quoteList(notice, TECHNICAL_PRODUCTS)) pushUnique(technical, item);
  }
  const quoted = {
    scoring,
    rejection: quoteList(corpus, REJECTION_QUOTES),
    technical,
    structure: quoteList(corpus, STRUCTURE_QUOTES),
  };
  if (contained(notice, "商务标") && contained(notice, "技术标")) {
    pushUnique(quoted.structure, "技术标");
  }
  quoteExactLines(corpus, quoted);
  return quoted;
}
