// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 014 K-3 质疑与异议的法定窗口（确定性，只做日期推算，不下法律结论）。
 *
 * 依据（2026-11-08 对照官方原文）：
 * - 政府采购：《政府采购法》第五十二条、《政府采购法实施条例》第五十三条、《政府采购质疑和投诉办法》（财政部令第94号）第十条、第十一条——
 *   知道或应知权益受损之日起 7 个工作日内书面质疑；对采购文件，从获取采购文件或采购文件公告期限届满之日起算；
 *   对中标或成交结果，从结果公告期限届满之日起算。
 * - 依法必须招标：《招标投标法实施条例》第二十二条（对招标文件有异议，投标截止时间 10 日前提出）、
 *   第四十四条（对开标有异议，开标现场提出）、第五十四条（对评标结果有异议，中标候选人公示期间提出；公示期不得少于 3 日）。
 * 期间起算：开始的当日不计入（《民法典》第二百零一条），所以「起 N 个工作日」= addWorkdays(起算日, N)。
 */
import { addWorkdays, chinaDate } from "./workdayCalendar.ts";

export type LegalRegime = "政府采购" | "依法必须招标" | "其他";

export type ChallengeKind = "采购文件质疑" | "结果质疑" | "招标文件异议" | "开标异议" | "评标结果异议";

export interface ChallengeWindow {
  kind: ChallengeKind;
  /** 截止：日期 "YYYY-MM-DD"（按日计）或 "YYYY-MM-DDTHH:mm"（有具体时刻）；null = 只能现场提出或缺起算日。 */
  until: string | null;
  /** 给人看的规则一句话，含起算日和天数口径。 */
  rule: string;
  /** 依据条文。 */
  basis: string;
  /** false = 跨了没公布放假安排的年份，只扣了周末。 */
  verified: boolean;
}

export interface ChallengeInput {
  regime: LegalRegime;
  /** 采购文件 / 招标公告发布日。 */
  noticePublishedAt?: string | null;
  /** 采购文件公告期限：发布之日起 N 个工作日（公告写明时）。 */
  noticePeriodWorkdays?: number | null;
  /** 我方获取采购文件的日期（用户记下时）。 */
  docObtainedAt?: string | null;
  /** 投标截止 "YYYY-MM-DDTHH:mm"。 */
  deadline?: string | null;
  openAt?: string | null;
  /** 中标 / 成交结果公告发布日。 */
  resultPublishedAt?: string | null;
  /** 结果公告期限：发布之日起 N 个工作日（政府采购结果公告通常写 1 个工作日）。 */
  resultPeriodWorkdays?: number | null;
  /** 中标候选人公示截止（公示写明时）。 */
  candidateNoticeEnd?: string | null;
  /** 中标候选人公示发布日（没写截止时用来推最短公示期）。 */
  candidatePublishedAt?: string | null;
}

const DAY = 86_400_000;

function minusDays(at: string, days: number): string {
  const hasTime = at.includes("T");
  const ms = Date.parse(hasTime ? `${at}:00Z` : `${at}T00:00:00Z`);
  const out = new Date(ms - days * DAY).toISOString();
  return hasTime ? out.slice(0, 16) : out.slice(0, 10);
}

function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

const GOV_BASIS = "《政府采购法》第五十二条、《政府采购法实施条例》第五十三条、财政部令第94号第十条";

export function challengeWindows(input: ChallengeInput): ChallengeWindow[] {
  const out: ChallengeWindow[] = [];
  if (input.regime === "政府采购") {
    const obtained = input.docObtainedAt ? chinaDate(input.docObtainedAt) : null;
    const published = input.noticePublishedAt ? chinaDate(input.noticePublishedAt) : null;
    const period = input.noticePeriodWorkdays ?? null;
    const periodEnd = published !== null && period !== null && period > 0 ? addWorkdays(published, period) : null;
    // 两个起算点取更早的一个算出的截止：宁早勿晚，界面写明另一个口径。
    const candidates: Array<{ from: string; label: string; verified: boolean }> = [];
    if (obtained !== null) candidates.push({ from: obtained, label: `获取采购文件之日（${obtained}）`, verified: true });
    if (periodEnd !== null) candidates.push({ from: periodEnd.date, label: `采购文件公告期限届满之日（${periodEnd.date}）`, verified: periodEnd.verified });
    if (candidates.length > 0) {
      const computed = candidates.map((item) => ({ ...item, until: addWorkdays(item.from, 7) }));
      computed.sort((a, b) => a.until.date.localeCompare(b.until.date));
      const first = computed[0]!;
      out.push({
        kind: "采购文件质疑",
        until: first.until.date,
        rule: `自${first.label}起 7 个工作日（已扣节假日）${computed.length > 1 ? "，取两个起算口径中较早的一个" : ""}`,
        basis: `${GOV_BASIS}、第十一条`,
        verified: first.verified && first.until.verified,
      });
    }
    const resultAt = input.resultPublishedAt ? chinaDate(input.resultPublishedAt) : null;
    if (resultAt !== null) {
      const days = input.resultPeriodWorkdays ?? null;
      const end = days !== null && days > 0 ? addWorkdays(resultAt, days) : { date: resultAt, verified: true };
      const until = addWorkdays(end.date, 7);
      out.push({
        kind: "结果质疑",
        until: until.date,
        rule: days !== null && days > 0
          ? `结果公告期限（发布起 ${days} 个工作日）届满之日 ${end.date} 起 7 个工作日（已扣节假日）`
          : `公告没写明公告期限，按结果公告发布日 ${resultAt} 起 7 个工作日推算（已扣节假日），以公告期限为准时可能更晚`,
        basis: GOV_BASIS,
        verified: end.verified && until.verified,
      });
    }
    return out;
  }
  if (input.regime === "依法必须招标") {
    if (input.deadline) {
      out.push({
        kind: "招标文件异议",
        until: minusDays(input.deadline, 10),
        rule: "投标截止时间 10 日前提出（按自然日）",
        basis: "《招标投标法实施条例》第二十二条",
        verified: true,
      });
    }
    if (input.openAt) {
      out.push({
        kind: "开标异议",
        until: null,
        rule: `开标现场当场提出（开标 ${input.openAt.replace("T", " ")}）`,
        basis: "《招标投标法实施条例》第四十四条",
        verified: true,
      });
    }
    if (input.candidateNoticeEnd) {
      out.push({
        kind: "评标结果异议",
        until: chinaDate(input.candidateNoticeEnd),
        rule: "中标候选人公示期间提出（按公示写明的截止）",
        basis: "《招标投标法实施条例》第五十四条",
        verified: true,
      });
    } else if (input.candidatePublishedAt) {
      out.push({
        kind: "评标结果异议",
        until: plusDays(chinaDate(input.candidatePublishedAt), 3),
        rule: "中标候选人公示期间提出；公示没写截止，按最短 3 日推算，以公示写明的为准",
        basis: "《招标投标法实施条例》第五十四条",
        verified: true,
      });
    }
  }
  return out;
}
