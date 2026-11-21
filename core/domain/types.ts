// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
import type {
  AgentMode,
  AnnounceStage,
  AttachmentOption,
  CompanyRole,
  Decision,
  InfoType,
  InternalStage,
  ProcurementType,
  PublishWindow,
  SearchMethod,
  SearchScope,
  SkillId,
  SortOption,
} from "./catalog.ts";

export type { InfoType };

export interface RegionPick {
  province: string;
  city: string;
}

export interface FilterState {
  mode: AgentMode;
  skill: SkillId;
  region: RegionPick;
  publishWindow: PublishWindow;
  infoTypes: InfoType[];
  procurementType: ProcurementType;
  keyword: string;
  mustInclude: string;
  exclude: string;
  searchMethod: SearchMethod;
  searchScope: SearchScope;
  amountMinWan: number | null;
  amountMaxWan: number | null;
  attachment: AttachmentOption;
  industryL1: string;
  industryL2: string;
  industryL3: string;
  companyRole: CompanyRole;
  companyName: string;
  contractFrom: string;
  contractTo: string;
  sort: SortOption;
  pageSize: number;
  pageId: number;
}

export interface ProjectRow {
  projectId: string;
  legacyCategory: string;
  title: string;
  projectNo: string;
  region: string;
  province: string;
  city: string;
  buyer: string;
  agency: string;
  infoType: InfoType;
  procurementType: Exclude<ProcurementType, "不限">;
  budgetWan: number;
  awardWan: number | null;
  publishedAt: string;
  bidOpenAt: string;
  industry: string;
  industryL1: string;
  industryL2: string;
  industryL3: string;
  winner: string;
  attachmentCount: number;
  announceStage: AnnounceStage;
  planned: boolean;
  openPlace: string;
  summary: string;
  markdown: string;
  sourceUrl?: string;
}

export interface AttachmentItem {
  name: string;
  kind: string;
  sizeKb: number;
  url: string;
}

export type DataSource = "live" | "unconfigured";

// C1 · provider capability model (specs/006-real-data-ux/spec.md)
export type FilterSupport = "native" | "postFilter" | "unsupported";
export type FilterKey =
  | "keyword"
  | "mustInclude"
  | "exclude"
  | "searchMethod"
  | "searchScope"
  | "province"
  | "city"
  | "publishWindow"
  | "infoTypes"
  | "procurementType"
  | "amount"
  | "industry"
  | "attachment"
  | "company"
  | "contractDate"
  | "sort"
  | "pageSize"
  | "mode";

export interface ProviderCapabilities {
  id: string;
  label: string;
  filters: Record<Exclude<FilterKey, "mode">, FilterSupport>;
  detail: boolean;
  attachments: boolean;
  company: boolean;
  contracts: boolean;
  body?: boolean;
  followUps?: boolean;
  modes: { awarded: boolean; planned: boolean };
}

export interface AppliedFilterReport {
  native: FilterKey[];
  postFilter: FilterKey[];
  unsupported: FilterKey[];
  summary: string;
}

export interface CompanyProfile {
  name: string;
  role: CompanyRole;
  region: string;
  winCount: number;
  recentTitles: string[];
  summary: string;
  source?: DataSource;
}

export interface SearchInsights {
  industryFocus: string;
  keyBuyers: string[];
  amountRange: string;
  notes: string[];
}

/** BL-35：notice 的可点动作——字符串 notice 里「在侧栏打开」这类线索点不动，动作要结构化带下来。 */
export interface SearchNoticeAction {
  /** 动作类型：在侧栏浏览器打开信源页。 */
  kind: "openSidebarBrowser";
  /** 按钮文案（服务端中文，和 notice 文案一致）。 */
  label: string;
  /** 聚合目录信源 id。 */
  sourceId: string;
  /** 信源名（按钮前缀）。 */
  sourceName?: string;
  /** 点开后打开的地址（信源首页/列表页）。 */
  url: string;
}

export interface SearchResult {
  totalHits: number;
  pageId: number;
  pageSize: number;
  hasNext: boolean;
  rows: ProjectRow[];
  insights: SearchInsights;
  source: DataSource;
  notice?: string;
  /** BL-35：notice 里每个引导信源对应的可点动作；前端渲染成按钮。 */
  noticeActions?: SearchNoticeAction[];
  provider?: string;
  applied?: AppliedFilterReport;
}

export interface ProjectDetail {
  row?: ProjectRow;
  request: Record<string, unknown>;
  raw: Record<string, unknown>;
  attachments: AttachmentItem[];
  source?: DataSource;
  notice?: string;
}

export interface BoardCard {
  projectId: string;
  title: string;
  buyer: string;
  amountWan: number | null;
  amountKind?: "award" | "budget";
  region: string;
  time: string;
  timeKind?: "deadline" | "published";
  deadline?: string;
  bidOpenAt?: string;
  announceStage: AnnounceStage;
  announceTag: string;
  internalStage: InternalStage;
  decision: Decision;
  progress: number;
  docProgress?: number;
  /** 011 D3：标书章节完成数 / 章节总数 / 待填处数（draftProgress 口径，服务端随 docProgress 写入）。 */
  docWritten?: number;
  docTotal?: number;
  docHoles?: number;
  /** 看标抽到了截止、预算、资格或评分之一；空 facts.json 为 false。 */
  factsReady?: boolean;
  planned: boolean;
  folderSlug?: string;
  sourceUrl?: string;
  projectNo?: string;
  publishedAt?: string;
  tracking?: import("./tracking.ts").TrackingState | undefined;
  repairs?: string[];
  /** ISO 时间。有值即置顶。 */
  pinnedAt?: string;
  /** K05：标段标记（一/二/3/…），标题里带的；无标段项目不标。 */
  lot?: string;
  /** K05：同项目家族兄弟公告（更正/结果相对原公告），dedupe 时互记。 */
  related?: Array<{ projectId: string; announceStage: AnnounceStage }>;
}

export interface WorkbenchHistoryEntry {
  key: string;
  datasetName: string;
  skill: SkillId;
  rowCount: number;
  savedAt: string;
  active: boolean;
}

export interface WorkbenchPage {
  skill: SkillId;
  title: string;
  datasetName: string;
  /** Stable id, `${skill}-${Date.now()}`-style, generated when the page is stored. */
  key?: string;
  rows: ProjectRow[];
  selectedIds: string[];
  chartCite?: string;
  attachments?: AttachmentItem[];
  notes?: string;
  source?: DataSource;
  lastError?: string;
  favoriteIds?: string[];
  filters?: FilterState;
  pageId?: number;
  pageSize?: number;
  totalHits?: number;
  hasNext?: boolean;
  provider?: string;
  applied?: AppliedFilterReport;
  analyzeText?: string;
  companyProfile?: CompanyProfile;
  focusProjectId?: string;
}

export type TableColumnKey =
  | "projectId"
  | "legacyCategory"
  | "title"
  | "projectNo"
  | "region"
  | "buyer"
  | "agency"
  | "infoType"
  | "procurementType"
  | "budgetWan"
  | "awardWan"
  | "publishedAt"
  | "bidOpenAt"
  | "industry"
  | "winner"
  | "attachmentCount"
  | "announceStage";
