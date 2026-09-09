import Link from 'next/link';
import { redirect } from 'next/navigation';
import TopBar from '@/components/TopBar';
import Calendar from '@/components/Calendar';
import GenerateButton from '@/components/GenerateButton';
import InterestButton from '@/components/InterestButton';
import { VerdictBadge, DdayBadge, ddayClass, ResultIcon, FundTypeBadge } from '@/components/ui';
import { getCompany, listCompanies, matchAll, interestIds, dataSourceInfo } from '@/lib/repo';
import { actionCards } from '@/lib/matcher';
import { formatKRW } from '@/lib/profile';
import type { MatchResult, Verdict } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<{ c?: string }> }) {
  const params = await searchParams;
  const companies = listCompanies();
  if (companies.length === 0) redirect('/onboard');

  const company = getCompany(Number(params.c)) ?? companies[0];
  const matches = matchAll(company);
  const interests = interestIds(company.id);
  const sources = dataSourceInfo();

  // 마감된 공고는 판정과 무관하게 별도로 분리한다. '지원가능'인데 이미 마감이면 거짓 신호다.
  const isExpired = (m: MatchResult) => m.dday !== null && m.dday < 0;
  const expired = matches.filter(isExpired);
  const live = matches.filter((m) => !isExpired(m));

  const groups: Record<Verdict, MatchResult[]> = { eligible: [], needs_check: [], ineligible: [] };
  for (const m of live) groups[m.verdict].push(m);

  const thisWeek = live.filter((m) => m.verdict !== 'ineligible' && (m.dday ?? 99) <= 7);
  const cards = actionCards(matches, 3);

  // 마감 알림 스케줄 (D-14 / D-7 / D-3 / D-1) — 실제 발송은 P1, 여기서는 예정만 보여준다.
  const alertPlan = live
    .filter((m) => m.verdict !== 'ineligible' && m.dday !== null)
    .flatMap((m) => [14, 7, 3, 1]
      .filter((d) => (m.dday ?? 0) >= d)
      .map((d) => ({ dday: d, daysLater: (m.dday ?? 0) - d, title: m.program.title })))
    .sort((a, b) => a.daysLater - b.daysLater)
    .slice(0, 5);

  return (
    <>
      <TopBar company={company} />
      <div className="wrap">

        {!sources.hasLive && (
          <div className="notice warn" style={{ marginTop: 16 }}>
            <b>샘플 데이터로 동작 중입니다.</b> 현재 공고 {matches.length}건은 매칭 동작 검증용 시드입니다.
            실제 공고를 쓰려면 <code>.env</code> 에 <code>BIZINFO_API_KEY</code> 를 넣고 <code>npm run ingest</code> 를 실행하십시오.
          </div>
        )}

        {company.profile_completeness < 100 && (
          <div className="notice" style={{ marginTop: 12 }}>
            프로파일 완성도 <b>{company.profile_completeness}%</b> — 비어 있는 항목이 있으면 판정이
            &lsquo;확인필요&rsquo;로 늘어납니다. <Link href="/onboard">정보 보완하기</Link>
          </div>
        )}

        <div className="kpis">
          <div className="card kpi">
            <div className="v" style={{ color: 'var(--ok)' }}>{groups.eligible.length}</div>
            <div className="l">지원가능</div>
          </div>
          <div className="card kpi">
            <div className="v" style={{ color: 'var(--warn)' }}>{groups.needs_check.length}</div>
            <div className="l">확인필요</div>
          </div>
          <div className="card kpi">
            <div className="v" style={{ color: 'var(--urgent)' }}>{thisWeek.length}</div>
            <div className="l">7일 내 마감</div>
          </div>
          <div className="card kpi">
            <div className="v">{interests.size}</div>
            <div className="l">관심 공고</div>
          </div>
        </div>

        <div className="section-title">
          🔥 지금 해야 할 일
          <small>마감이 가깝고 적합도가 높은 순</small>
        </div>
        {cards.length === 0 ? (
          <div className="card empty">현재 접수 중인 공고가 없습니다.</div>
        ) : (
          <div className="actions">
            {cards.map((m) => (
              <div className={`card action ${ddayClass(m.dday)}`} key={m.program.id}>
                <div className="row">
                  <DdayBadge d={m.dday} />
                  <VerdictBadge v={m.verdict} />
                  <div className="spacer" />
                  <span className="score-pill">{m.score}</span>
                </div>
                <h3>{m.program.title}</h3>
                <div className="meta">
                  {m.program.agency}<br />
                  최대 {formatKRW(m.program.support_amount_max)} · 마감 {m.program.apply_end_at}
                </div>
                <div className="foot">
                  {m.verdict === 'eligible'
                    ? <GenerateButton companyId={company.id} programId={m.program.id} />
                    : <Link className="btn sm" href={`#p-${m.program.id}`}>자격 확인하기</Link>}
                  <InterestButton companyId={company.id} programId={m.program.id}
                    initial={interests.has(m.program.id)} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="split" style={{ marginTop: 26 }}>
          <div>
            <Calendar matches={matches} />
            <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
              <b style={{ fontSize: 13 }}>마감 알림 예정</b>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.7 }}>
                {alertPlan.length === 0 && <span style={{ color: 'var(--text-3)' }}>예정된 알림이 없습니다.</span>}
                {alertPlan.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <span className={`badge ${a.dday <= 3 ? 'urgent' : a.dday <= 7 ? 'soon' : 'plain'}`}
                      style={{ minWidth: 46, justifyContent: 'center' }}>D-{a.dday}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.daysLater === 0 ? '오늘' : `${a.daysLater}일 뒤`} · {a.title}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
                알림톡·이메일 발송은 다음 단계에서 연결됩니다. 발송 이력은 (기업·공고·채널·D-day)
                유니크 제약으로 중복 발송을 원천 차단하도록 설계되어 있습니다.
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
              <b style={{ fontSize: 13 }}>데이터 커버리지</b>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.8 }}>
                {sources.sources.map((s) => (
                  <div key={s.source}>
                    {s.source === 'seed' ? '샘플 시드' : s.source} — {s.count}건
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
                커버리지를 숨기지 않고 그대로 보여줍니다. 보이지 않는 공고가 있을 수 있다는 사실을
                아는 것이, 다 보인다고 착각하는 것보다 안전합니다.
              </div>
            </div>
          </div>

          <div>
            <details className="card group" open>
              <summary>
                ✅ 지원가능 <span className="count">({groups.eligible.length})</span>
              </summary>
              {groups.eligible.map((m) => <ProgramRow key={m.program.id} m={m} companyId={company.id} interested={interests.has(m.program.id)} />)}
              {groups.eligible.length === 0 && <div className="empty">조건을 충족하는 공고가 없습니다.</div>}
            </details>

            <details className="card group" open>
              <summary>
                ⚠ 확인필요 <span className="count">({groups.needs_check.length})</span>
              </summary>
              <div style={{ padding: '0 16px 8px', fontSize: 12, color: 'var(--text-2)' }}>
                자동으로 판정할 수 없는 요건이 남아 있는 공고입니다. 버리지 않고 따로 모아둡니다 —
                여기에 기회가 숨어 있습니다.
              </div>
              {groups.needs_check.map((m) => <ProgramRow key={m.program.id} m={m} companyId={company.id} interested={interests.has(m.program.id)} />)}
              {groups.needs_check.length === 0 && <div className="empty">확인이 필요한 공고가 없습니다.</div>}
            </details>

            <details className="card group">
              <summary>
                ❌ 불가 <span className="count">({groups.ineligible.length})</span>
              </summary>
              {groups.ineligible.map((m) => <ProgramRow key={m.program.id} m={m} companyId={company.id} interested={interests.has(m.program.id)} />)}
            </details>

            <details className="card group">
              <summary>
                🕗 마감됨 <span className="count">({expired.length})</span>
              </summary>
              <div style={{ padding: '0 16px 8px', fontSize: 12, color: 'var(--text-2)' }}>
                접수가 끝난 공고입니다. 다음 회차 공고를 기다리는 데 참고하십시오.
              </div>
              {expired.map((m) => <ProgramRow key={m.program.id} m={m} companyId={company.id} interested={interests.has(m.program.id)} />)}
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

function ProgramRow({ m, companyId, interested }: { m: MatchResult; companyId: number; interested: boolean }) {
  const p = m.program;
  return (
    <details className="pgm" id={`p-${p.id}`}>
      <summary>
        <div className="sc">{m.score}</div>
        <div>
          <div className="t">{p.title}</div>
          <div className="s">
            {p.agency} · 최대 {formatKRW(p.support_amount_max)} · 마감 {p.apply_end_at ?? '상시'}
          </div>
        </div>
        <div className="r">
          <FundTypeBadge t={p.fund_type} />
          <DdayBadge d={m.dday} />
          <VerdictBadge v={m.verdict} />
        </div>
      </summary>

      <div className="pgm-body">
        <table className="reasons">
          <thead>
            <tr>
              <th></th><th>요건</th><th>우리 회사</th><th>구분</th>
            </tr>
          </thead>
          <tbody>
            {m.evaluations.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-3)' }}>구조화된 자격요건이 없습니다. 공고문을 확인하십시오.</td></tr>
            )}
            {m.evaluations.map((e) => (
              <tr key={e.rule.id}>
                <td className="res"><ResultIcon r={e.result} /></td>
                <td>
                  {e.required}
                  <div className="src-quote">&ldquo;{e.rule.source_text}&rdquo;</div>
                </td>
                <td>
                  {e.actual}
                  {e.note && <div className="src-quote">{e.note}</div>}
                </td>
                <td>{e.rule.is_bonus ? <span className="badge plain">가점</span> : <span className="badge plain">필수</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bd">
          {m.scoreBreakdown.map((b) => (
            <div className="bd-row" key={b.label}>
              <span style={{ color: 'var(--text-2)' }}>{b.label}</span>
              <span className="bar"><i style={{ width: `${(b.earned / b.max) * 100}%` }} /></span>
              <span className="n">{b.earned}/{b.max}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
          {m.scoreBreakdown.map((b) => `${b.label}: ${b.note}`).join(' · ')}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <GenerateButton companyId={companyId} programId={p.id}
            label={m.verdict === 'eligible' ? '지원서 만들기' : '그래도 지원서 만들기'}
            className={m.verdict === 'eligible' ? 'btn primary sm' : 'btn sm'} />
          <InterestButton companyId={companyId} programId={p.id} initial={interested} />
          {p.url && <a className="btn sm" href={p.url} target="_blank" rel="noreferrer">공고 원문 ↗</a>}
          {p.target_summary && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>지원대상: {p.target_summary}</span>
          )}
        </div>
      </div>
    </details>
  );
}
