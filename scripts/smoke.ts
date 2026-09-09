/** 엔진 스모크 테스트 — UI 없이 전체 파이프라인을 검증한다. */
import { loadSeed } from '../src/lib/ingest';
import { upsertCompany, getCompanyOwned, matchAll, getProgram } from '../src/lib/repo';
import { getDb, resetDb } from '../src/lib/db';
import { computeCompleteness } from '../src/lib/profile';
import { generateApplication, loadApplicationView } from '../src/lib/pipeline';
import { isValidBizNo, bizNoKind } from '../src/lib/bizno';

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('  ✗', msg); process.exitCode = 1; } else console.log('  ✓', msg);
}

async function main() {
  // 개발용 DB와 섞이지 않도록 전용 DB에서 처음부터 만든다 (npm script 가 DB_PATH 를 지정).
  resetDb();

  console.log('\n[1] 사업자번호 검증');
  assert(isValidBizNo('220-81-62517') === true, '유효한 번호 통과 (220-81-62517)');
  assert(isValidBizNo('123-45-67890') === false, '체크섬 불일치 번호 거부 (123-45-67890)');
  assert(isValidBizNo('0000000000') === false, '반복 숫자 거부');
  assert(bizNoKind('220-81-62517') === '법인', '법인/개인 구분');

  console.log('\n[2] 시드 적재');
  const seedRes = loadSeed();
  assert(seedRes.inserted + seedRes.updated === 28, `공고 28건 적재 (신규 ${seedRes.inserted}/갱신 ${seedRes.updated})`);

  console.log('\n[3] 기업 프로파일');
  const profile = {
    biz_no: '2208162517', name: '(주)한빛푸드',
    status: '계속사업자', tax_type: '부가가치세 일반과세자',
    industry_code: 'C10', industry_name: '제조업 - 식료품',
    region_sido: '경기도', region_sigungu: '화성시',
    founded_at: '2022-06-15', employee_band: '10-49', revenue_band: '5-10억',
    is_woman_owned: 0, is_disabled_owned: 0, is_social_enterprise: 0,
    is_venture_certified: 0, has_research_institute: 0,
  };
  // 소유자 없이 기업을 만들 수 없다. 스모크용 사용자를 하나 만들어 붙인다.
  const uid = Number((getDb().prepare(
    "INSERT INTO users (email, role) VALUES ('smoke@example.com','user') ON CONFLICT(email) DO UPDATE SET role='user' RETURNING id",
  ).get() as { id: number }).id);
  const id = upsertCompany({ ...profile, profile_completeness: computeCompleteness(profile) }, uid);
  const company = getCompanyOwned(id, uid)!;
  assert(company.profile_completeness === 100, `프로파일 완성도 ${company.profile_completeness}%`);
  assert(company.user_id === uid, '기업에 소유자가 지정됨');
  assert(getCompanyOwned(id, uid + 999) === null, '다른 사용자로는 조회되지 않음 (소유권 검증)');

  console.log('\n[4] 매칭 (3단계 분류)');
  const matches = matchAll(company);
  const g = { eligible: 0, needs_check: 0, ineligible: 0 };
  for (const m of matches) g[m.verdict]++;
  console.log(`  지원가능 ${g.eligible} / 확인필요 ${g.needs_check} / 불가 ${g.ineligible}`);
  assert(g.eligible > 0, '지원가능 공고가 존재');
  assert(g.needs_check > 0, '확인필요 공고가 존재 (판단 불가 요건 격리)');
  assert(g.ineligible > 0, '불가 공고가 존재');

  const straddle = matches.find((m) => m.program.source_uid === 'seed-015');
  assert(straddle?.verdict === 'needs_check',
    `매출 구간이 기준선에 걸친 공고는 확인필요 (seed-015 → ${straddle?.verdict})`);

  const partial = matches.find((m) => m.program.source_uid === 'seed-016');
  assert(partial?.verdict === 'needs_check', `파싱 불완전 공고는 확인필요 (seed-016 → ${partial?.verdict})`);

  const woman = matches.find((m) => m.program.source_uid === 'seed-005');
  assert(woman?.verdict === 'ineligible', `여성기업 전용자금은 불가 (seed-005 → ${woman?.verdict})`);

  console.log('\n  상위 5건:');
  for (const m of matches.slice(0, 5)) {
    console.log(`   ${m.verdict.padEnd(11)} ${String(m.score).padStart(3)}점  D-${m.dday}  ${m.program.title}`);
  }

  console.log('\n[5] 지원서 생성 파이프라인');
  const target = matches.find((m) => m.verdict === 'eligible')!;
  const program = getProgram(target.program.id)!;
  const gen = await generateApplication(company, program, { force: true });
  console.log(`  엔진: ${gen.engine}, 반복 ${gen.iterations}회, 점수 추이: ${gen.scores.join(' → ')}`);
  assert(gen.scores.length >= 2, '재작성 루프가 최소 1회 실행됨');
  assert(gen.scores[gen.scores.length - 1] > gen.scores[0], '재작성으로 점수가 상승');

  const view = loadApplicationView(gen.applicationId, company, program);
  assert(view.sections.length === 4, 'PSST 4섹션 생성');
  assert(view.sections.every((s) => s.content.length > 100), '모든 섹션에 본문 존재');
  console.log(`  최종 ${view.judge.total}/100 (통과선 ${view.judge.passLine})`);
  for (const c of view.judge.criteria) console.log(`    - ${c.label}: ${c.score}/${c.max}`);

  console.log('\n[6] 팩트체크');
  console.log(`  미해결 [확인 필요] ${view.report.unresolvedMarkers.length}건, 대조불가 수치 ${view.report.unverifiedNumbers.length}건, 검증됨 ${view.report.verifiedCount}건`);
  assert(view.report.unresolvedMarkers.length > 0, '값이 없는 슬롯은 확인 필요로 남음 (환각 대신 공백)');
  assert(view.report.unverifiedNumbers.length === 0, '지어낸 수치가 없음');

  console.log('\n완료.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
