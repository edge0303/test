import type {
  Company, Program, DraftSection, JudgeResult, FactSlot, SectionKey,
} from './types';
import { buildFactSlots, templateDraft, renderSlots, SECTION_META } from './psst';
import { judgeDeterministic, TARGET_SCORE, failedFixes } from './judge';
import { rewriteDeterministic, fixInstructionsBySection } from './rewriter';
import { verify } from './verifier';
import { callLlm, extractJson, llmAvailable } from './llm';
import {
  createApplication, findApplication, saveSections, saveScore, saveFactSlots,
  latestSections, scoreHistory,
} from './repo';
import { formatKRW } from './profile';

const MAX_ITERATIONS = 3;
const MIN_DELTA = 2; // 상승폭이 이보다 작으면 수렴으로 보고 종료

function programBrief(p: Program): string {
  return [
    `사업명: ${p.title}`,
    `주관기관: ${p.agency}`,
    `유형: ${p.fund_type === 'loan' ? '정책자금(융자)' : '지원금(보조)'}`,
    `지원한도: ${formatKRW(p.support_amount_max)}`,
    `접수기간: ${p.apply_start_at ?? '-'} ~ ${p.apply_end_at ?? '-'}`,
    `지원대상: ${p.target_summary ?? '-'}`,
  ].join('\n');
}

function companyBrief(c: Company, slots: FactSlot[]): string {
  return slots
    .filter((s) => s.value)
    .map((s) => `- ${s.label}: ${s.value}`)
    .join('\n') + `\n- 기업명: ${c.name}`;
}

const DRAFT_SYSTEM = `당신은 대한민국 정부지원사업 사업계획서 작성 전문가입니다.
PSST(문제인식-실현가능성-성장전략-팀구성) 구조로 초안을 작성합니다.

절대 규칙:
1. 숫자를 지어내지 마십시오. 제공된 팩트 슬롯에 있는 값만 사용하고, 반드시 {{fact:키}} 형태의 자리표시자로 쓰십시오.
2. 슬롯에 없는 수치(시장 규모, 특허 수, 목표 매출 등)가 필요하면 해당 슬롯 자리표시자를 그대로 쓰십시오. 임의의 숫자를 넣으면 안 됩니다.
3. 과장 표현("혁신적", "획기적", "최고의")을 쓰지 마십시오. 심사위원은 검증 가능한 서술만 인정합니다.
4. 표가 필요한 곳에는 마크다운 표를 사용하십시오.
5. 출력은 JSON 하나만 반환하십시오. 다른 텍스트를 덧붙이지 마십시오.`;

async function llmDraft(c: Company, p: Program, slots: FactSlot[]): Promise<DraftSection[] | null> {
  const slotList = slots.map((s) => `{{fact:${s.key}}} = ${s.value ?? '(값 없음 — 그대로 두면 [확인 필요]로 표시됨)'}`).join('\n');
  const user = `아래 공고에 지원할 사업계획서 초안을 작성하십시오.

[공고]
${programBrief(p)}

[신청 기업]
${companyBrief(c, slots)}

[사용 가능한 팩트 슬롯]
${slotList}

다음 JSON 형식으로만 응답하십시오.
{"problem":"마크다운 텍스트","solution":"...","scaleup":"...","team":"..."}`;

  const raw = await callLlm({ system: DRAFT_SYSTEM, user, maxTokens: 6000, temperature: 0.4 });
  const parsed = extractJson<Record<SectionKey, string>>(raw);
  if (!parsed) return null;
  const out: DraftSection[] = [];
  for (const meta of SECTION_META) {
    const content = parsed[meta.key];
    if (typeof content !== 'string' || content.trim().length < 50) return null;
    out.push({ key: meta.key, title: meta.title, content: content.trim() });
  }
  return out;
}

const REWRITE_SYSTEM = `당신은 정부지원사업 사업계획서를 심사 기준에 맞게 고치는 전문가입니다.
주어진 섹션을 아래 수정 지시대로 고쳐 전체 섹션을 다시 작성합니다.

절대 규칙:
1. 숫자를 지어내지 마십시오. 확인되지 않은 수치는 [확인 필요: 항목명] 으로 남기십시오.
2. 기존에 이미 충족한 내용은 삭제하지 말고 유지하십시오.
3. 지시받은 결함만 보강하십시오. 다른 섹션 내용을 끌어오지 마십시오.
4. 출력은 고쳐진 섹션 본문(마크다운)만 반환하십시오. 설명을 덧붙이지 마십시오.`;

async function llmRewrite(
  sections: DraftSection[],
  judge: JudgeResult,
  ctx: { company: Company; program: Program; slots: FactSlot[] },
): Promise<DraftSection[] | null> {
  const fixes = fixInstructionsBySection(judge);
  const targets = sections.filter((s) => (fixes[s.key] ?? []).length > 0);
  if (targets.length === 0) return sections;

  const revised = await Promise.all(
    targets.map(async (s) => {
      const user = `[공고]
${programBrief(ctx.program)}

[현재 섹션: ${s.title}]
${s.content}

[심사위원 수정 지시]
${(fixes[s.key] ?? []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

위 지시를 모두 반영한 섹션 전문을 반환하십시오.`;
      const out = await callLlm({ system: REWRITE_SYSTEM, user, maxTokens: 3000, temperature: 0.3 });
      return out && out.length > 100 ? { ...s, content: out.trim() } : null;
    }),
  );

  if (revised.some((r) => r === null)) return null;
  const map = new Map(revised.filter((r): r is DraftSection => r !== null).map((r) => [r.key, r]));
  return sections.map((s) => map.get(s.key) ?? s);
}

async function llmNarrative(judge: JudgeResult, program: Program): Promise<string | null> {
  const failed = failedFixes(judge);
  const user = `아래는 「${program.title}」에 지원할 사업계획서의 자동 채점 결과입니다.

총점: ${judge.total} / 100 (통과 예상선 ${judge.passLine})
${judge.criteria.map((c) => `- ${c.label}: ${c.score}/${c.max}`).join('\n')}

남은 감점 항목:
${failed.length ? failed.map((f) => `- [${f.section}] ${f.label}`).join('\n') : '- 없음'}

해당 분야 심사위원 관점에서 이 계획서의 당락을 좌우할 핵심 쟁점을 3문장 이내로 지적하십시오.
칭찬은 쓰지 말고, 심사장에서 실제로 나올 질문 형태로 쓰십시오.`;
  return callLlm({
    system: '당신은 정부지원사업 심사위원입니다. 하루 40건을 읽고 3건만 통과시킵니다. 간결하고 냉정하게 지적합니다.',
    user,
    maxTokens: 500,
    temperature: 0.2,
  });
}

export interface GenerateResult {
  applicationId: number;
  engine: 'deterministic' | 'deterministic+llm';
  iterations: number;
  scores: number[];
}

/**
 * 작성 → 채점 → 재작성 루프 → 팩트체크 파이프라인.
 * 종료 조건 3가지 (기획서 10.3): 목표점 도달 / 3회 도달 / 상승폭 2점 미만(수렴).
 */
export async function generateApplication(
  company: Company,
  program: Program,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const existing = findApplication(company.id, program.id);
  if (existing && !opts.force) {
    const hist = scoreHistory(existing.id);
    return {
      applicationId: existing.id,
      engine: existing.engine as GenerateResult['engine'],
      iterations: existing.iteration_count,
      scores: hist.map((h) => h.total),
    };
  }

  const useLlm = llmAvailable();
  const slots = buildFactSlots(company, program);

  let sections = (useLlm ? await llmDraft(company, program, slots) : null) ?? templateDraft(company, program);
  sections = sections.map((s) => ({ ...s, content: renderSlots(s.content, slots) }));

  const applicationId = existing?.id ?? createApplication(company.id, program.id, useLlm ? 'deterministic+llm' : 'deterministic');
  saveFactSlots(applicationId, slots);

  let version = 1;
  saveSections(applicationId, sections, version);

  let judge = judgeDeterministic(sections);
  judge.engine = useLlm ? 'deterministic+llm' : 'deterministic';
  saveScore(applicationId, version, judge);
  const scores = [judge.total];

  while (version < MAX_ITERATIONS && judge.total < TARGET_SCORE) {
    // 고칠 결함이 남아 있지 않으면 더 돌리지 않는다.
    // 남은 감점이 '미확인 항목' 뿐이라면 그것은 사용자가 실제 값을 채워야 하는 몫이다.
    if (failedFixes(judge).length === 0) break;

    const ctx = { company, program, slots };
    let next = useLlm ? await llmRewrite(sections, judge, ctx) : null;
    if (!next) next = rewriteDeterministic(sections, judge, ctx);
    next = next.map((s) => ({ ...s, content: renderSlots(s.content, slots) }));

    const nextJudge = judgeDeterministic(next);
    nextJudge.engine = judge.engine;
    version += 1;
    sections = next;
    saveSections(applicationId, sections, version);
    saveScore(applicationId, version, nextJudge);
    scores.push(nextJudge.total);

    const delta = nextJudge.total - judge.total;
    judge = nextJudge;
    if (delta < MIN_DELTA) break; // 수렴 판정
  }

  if (useLlm) {
    const narrative = await llmNarrative(judge, program);
    if (narrative) {
      judge.narrative = narrative;
      saveScore(applicationId, version, judge);
    }
  }

  return { applicationId, engine: judge.engine, iterations: version, scores };
}

/** 저장된 지원서를 다시 읽어 화면에 필요한 형태로 조립한다. */
export function loadApplicationView(applicationId: number, company: Company, program: Program) {
  const rows = latestSections(applicationId);
  const sections: DraftSection[] = SECTION_META.map((m) => ({
    key: m.key,
    title: m.title,
    content: rows.find((r) => r.key === m.key)?.content ?? '',
  }));
  const history = scoreHistory(applicationId);
  const latest = history[history.length - 1]?.payload ?? judgeDeterministic(sections);
  const slots = buildFactSlots(company, program);
  return { sections, history, judge: latest, report: verify(sections, slots), slots };
}
