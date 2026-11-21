// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
export const PLUGIN_ID = "dsh-bid-agent";
export const PRODUCT_TITLE = "启标";
export const CRUMB_FOLDER = "招标";

export const MODES = ["prompt", "awarded", "planned"] as const;
export type AgentMode = (typeof MODES)[number];

export const MODE_LABEL: Record<AgentMode, string> = {
  prompt: "提示词生成",
  awarded: "招中标项目",
  planned: "拟在建项目",
};

export const SKILLS = [
  "project-search",
  "contract-search",
  "detail",
  "attachment",
  "company",
  "ai-analyze",
] as const;
export const PROJECT_SKILLS = ["read-tender", "audit-bid", "draft-proposal"] as const;
export type HomeSkillId = (typeof SKILLS)[number];
export type ProjectSkillId = (typeof PROJECT_SKILLS)[number];
export type SkillId = HomeSkillId | ProjectSkillId;

export const SKILL_LABEL: Record<SkillId, string> = {
  "project-search": "项目搜索",
  "contract-search": "合同搜索",
  detail: "详情查询",
  attachment: "附件查询",
  company: "企业画像",
  "ai-analyze": "AI辅助分析",
  "read-tender": "看标",
  "audit-bid": "审标",
  "draft-proposal": "做标书",
};

export const SKILL_HINT: Record<SkillId, string> = {
  // 视频可见四条按原文；项目搜索 / 详情查询 视频未露出 tooltip，按同一句式补齐。
  "project-search": "按地区、发布时间、信息类型搜索招中标；金额与拟在建视数据源",
  "contract-search": "按关键词、企业、金额与合同日期搜索；无端点时禁用",
  detail: "查询项目结构化详情；默认打开原文",
  attachment: "查询招中标或拟在建项目附件列表",
  company: "查询企业工商摘要；无联系人/客户/供应商",
  "ai-analyze": "基于工作台真实行研判；缺维则给补齐动作",
  "read-tender": "阅读已放入项目夹公告目录的招标文件并写看标纪要",
  "audit-bid": "对照看标纪要与标书草稿列出审标缺口",
  "draft-proposal": "按章节起草标书草稿，资质与报价空位待用户填写",
};

export const INFO_TYPES = [
  "招标预告",
  "公开招标",
  "单一来源采购",
  "竞争性谈判",
  "竞争性磋商",
  "重新招标",
  "邀请招标",
  "拍租公告",
  "答疑变更",
  "开标公示",
  "成交结果",
  "结果变更",
  "候选人公示",
  "合同公告",
  "流标废标",
  "其他",
] as const;
export type InfoType = (typeof INFO_TYPES)[number];

export const PROCUREMENT_TYPES = ["不限", "工程", "货物", "服务", "其他"] as const;
export type ProcurementType = (typeof PROCUREMENT_TYPES)[number];

export const PUBLISH_WINDOWS = ["不限", "近一周", "近一月", "近三月", "近半年", "近一年"] as const;
export type PublishWindow = (typeof PUBLISH_WINDOWS)[number];

export const SEARCH_METHODS = ["智能模糊", "精准", "高级"] as const;
export type SearchMethod = (typeof SEARCH_METHODS)[number];

export const SEARCH_SCOPES = ["全部", "标题", "全文"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SORT_OPTIONS = ["发布时间", "发布时间升序", "金额降序", "金额升序", "相关度"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: SortOption = "发布时间";

export const ATTACHMENT_OPTIONS = ["不限", "有附件", "无附件"] as const;

export const PRIMARY_FILTERS = ["选择地区", "发布时间", "信息类型", "采购类型", "搜索条件"] as const;
export const MORE_FILTERS = ["搜索方式", "金额", "附件", "行业", "参与企业", "合同日期", "排序"] as const;
export type AttachmentOption = (typeof ATTACHMENT_OPTIONS)[number];

export const COMPANY_ROLES = ["不限", "采购人", "中标人", "代理机构", "投标人"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const TABLE_COLUMNS = [
  { key: "projectId", label: "项目ID" },
  { key: "legacyCategory", label: "旧分类" },
  { key: "title", label: "标题" },
  { key: "projectNo", label: "项目编号" },
  { key: "region", label: "地区" },
  { key: "buyer", label: "采购人" },
  { key: "agency", label: "代理机构" },
  { key: "infoType", label: "信息类型" },
  { key: "procurementType", label: "采购类型" },
  { key: "budgetWan", label: "预算金额" },
  { key: "awardWan", label: "中标金额" },
  { key: "publishedAt", label: "发布时间" },
  { key: "bidOpenAt", label: "开标时间" },
  { key: "industry", label: "国标行业" },
  { key: "winner", label: "中标人" },
  { key: "attachmentCount", label: "附件" },
  { key: "announceStage", label: "公告阶段" },
] as const;

export const ANNOUNCE_STAGES = [
  "招标预告",
  "正式招标",
  "更正",
  "开标",
  "中标",
  "合同",
  "终止",
] as const;
export type AnnounceStage = (typeof ANNOUNCE_STAGES)[number];

export const INTERNAL_STAGES = [
  "lead",
  "prepare",
  "review",
  "submit",
  "result",
  "change",
  "archive",
] as const;
export type InternalStage = (typeof INTERNAL_STAGES)[number];

export const INTERNAL_STAGE_META: Record<InternalStage, { label: string; hint: string }> = {
  lead: { label: "项目线索", hint: "待研判与投标决策" },
  prepare: { label: "投标准备", hint: "资格、商务与技术标" },
  review: { label: "标书内审", hint: "合规、报价与盖章复核" },
  submit: { label: "待递交/开标", hint: "递交、签到与开标日程" },
  result: { label: "结果跟踪", hint: "候选人、中标与合同跟进" },
  change: { label: "变更跟进", hint: "更正、澄清与范围变更" },
  archive: { label: "异常/归档", hint: "不投标、流标与归档" },
};

export const DECISIONS = ["pending", "bid", "watch", "skip"] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABEL: Record<Decision, string> = {
  pending: "待研判",
  bid: "拟投标",
  watch: "继续跟踪",
  skip: "不投标",
};

export const CITE_AWARDED_DATA = "[数据引用 | 招中标搜索结果 · 数据]";
export const CITE_AWARDED_CHART = "[数据引用 | 招中标搜索结果 · 图表]";
export const DEMO_PROMPT =
  "@[项目搜索] 查询招中标项目；地区：北京、市辖区；发布时间：近半年；信息类型：公开招标；采购类型：服务；搜索范围：全部；搜索方式：高级；排序：发布时间；每页数量：50；金额范围：10万元 至 1000万元；一级行业编码：I；二级行业编码：I65";

export const DEMO_PROJECT_ID = "347924851";
export const DEMO_PROJECT_NO = "GXTC-D-261020017";
export const DEMO_PAGE_SIZE = 50;
