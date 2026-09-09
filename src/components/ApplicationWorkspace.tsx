'use client';

import { useState } from 'react';
import Markdown from './Markdown';
import { postJson } from '@/lib/client';
import type { JudgeResult, SectionKey } from '@/lib/types';
import type { VerifyReport } from '@/lib/verifier';

interface Props {
  applicationId: number;
  companyId: number;
  programId: number;
  sectionMeta: { key: SectionKey; title: string; question: string }[];
  initialSections: Record<SectionKey, string>;
  initialJudge: JudgeResult;
  initialReport: VerifyReport;
  history: { iteration: number; total: number }[];
  reviewStatus: string | null;
  reviewDue: string | null;
}

export default function ApplicationWorkspace(props: Props) {
  const [sections, setSections] = useState(props.initialSections);
  const [judge, setJudge] = useState(props.initialJudge);
  const [report, setReport] = useState(props.initialReport);
  const [history, setHistory] = useState(props.history);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<{ status: string | null; due: string | null }>({
    status: props.reviewStatus, due: props.reviewDue,
  });

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const json = await postJson<any>('/api/application/save',
        { applicationId: props.applicationId, sections });
      if (!json.ok) { setMsg(json.message); return; }
      setJudge(json.judge);
      setReport(json.report);
      setHistory((h) => [...h, { iteration: json.version, total: json.judge.total }]);
      setMsg(`저장 후 재채점 완료 — ${json.judge.total}점`);
    } finally { setBusy(null); }
  }

  async function regenerate() {
    setBusy('regen'); setMsg(null);
    try {
      const json = await postJson<any>('/api/application/generate',
        { companyId: props.companyId, programId: props.programId, force: true });
      if (!json.ok) { setMsg(json.message); return; }
      window.location.reload();
    } finally { setBusy(null); }
  }

  async function requestReview() {
    setBusy('review'); setMsg(null);
    try {
      const json = await postJson<any>('/api/review/request',
        { applicationId: props.applicationId });
      if (!json.ok) { setMsg(json.message); return; }
      setReview({ status: 'queued', due: json.dueAt });
      setMsg(`검수 요청이 접수되었습니다. 예상 완료일 ${json.dueAt}`);
    } finally { setBusy(null); }
  }

  const blockers = report.unresolvedMarkers.length + report.unverifiedNumbers.length;
  const maxScore = Math.max(...history.map((h) => h.total), judge.total, 1);

  return (
    <div className="app-grid">
      <div>
        <div className="tabs">
          <button className={`tab ${mode === 'preview' ? 'on' : ''}`} onClick={() => setMode('preview')}>미리보기</button>
          <button className={`tab ${mode === 'edit' ? 'on' : ''}`} onClick={() => setMode('edit')}>편집</button>
          <div className="spacer" />
          {mode === 'edit' && (
            <button className="btn primary sm" onClick={save} disabled={busy === 'save'}>
              {busy === 'save' ? '저장·재채점 중…' : '저장하고 다시 채점'}
            </button>
          )}
        </div>

        {msg && <div className="notice ok" style={{ marginBottom: 12 }}>{msg}</div>}

        {props.sectionMeta.map((m) => (
          <div className="card sec" key={m.key}>
            <h3>{m.title}</h3>
            <div className="q">{m.question}</div>
            {mode === 'edit' ? (
              <textarea
                value={sections[m.key] ?? ''}
                onChange={(e) => setSections({ ...sections, [m.key]: e.target.value })}
              />
            ) : (
              <Markdown text={sections[m.key] ?? ''} />
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="card rubric">
          <div className="total-line">
            <span className="big" style={{ color: judge.total >= judge.passLine ? 'var(--ok)' : 'var(--soon)' }}>
              {judge.total}
            </span>
            <span style={{ color: 'var(--text-3)' }}>/ 100</span>
            <div className="spacer" />
            <span className="badge plain">통과선 {judge.passLine}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
            {judge.total >= judge.passLine
              ? '통과 예상선을 넘었습니다. 미확인 항목만 정리하면 제출 가능합니다.'
              : `미확인 항목을 채우면 최대 +${judge.recoverable}점까지 회복됩니다.`}
          </div>

          {history.length > 1 && (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>점수 추이 (재작성 루프)</div>
              <div className="trend">
                {history.map((h) => (
                  <div className="col" key={h.iteration}>
                    <i style={{ height: `${Math.max(6, (h.total / maxScore) * 46)}px` }} />
                    <span>{h.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {judge.narrative && (
            <div className="notice" style={{ margin: '10px 0' }}>
              <b style={{ display: 'block', marginBottom: 4 }}>심사위원 총평</b>
              {judge.narrative}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {judge.criteria.map((c) => {
              const pct = (c.score / c.max) * 100;
              const cls = pct >= 80 ? '' : pct >= 50 ? 'mid' : 'low';
              return (
                <div className="crit" key={c.key}>
                  <div className="crit-head">
                    <span>{c.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.score} / {c.max}</span>
                  </div>
                  <div className="crit-bar"><i className={cls} style={{ width: `${pct}%` }} /></div>
                  {c.penalty > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 4 }}>{c.penaltyNote}</div>
                  )}
                  {c.checks.filter((k) => !k.passed).map((k) => (
                    <div className="chk" key={k.id}>
                      <div>❌ {k.label} <span style={{ color: 'var(--text-3)' }}>(-{k.weight})</span></div>
                      <div className="fix">→ {k.fix}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card rubric" style={{ marginTop: 12, position: 'static' }}>
          <b style={{ fontSize: 13 }}>제출 전 확인 ({blockers}건)</b>
          <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '6px 0 10px' }}>
            지어낸 숫자는 그 자체로 탈락 사유입니다. 아래 항목은 실제 값으로 채우거나 문장을 삭제하십시오.
          </div>

          {report.unresolvedMarkers.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                미확인 항목 {report.unresolvedMarkers.length}건
              </div>
              <ul style={{ paddingLeft: 18, margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)' }}>
                {dedupe(report.unresolvedMarkers.map((m) => m.label)).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </>
          )}

          {report.unverifiedNumbers.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--urgent)' }}>
                대조 불가 수치 {report.unverifiedNumbers.length}건
              </div>
              <ul style={{ paddingLeft: 18, margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)' }}>
                {report.unverifiedNumbers.slice(0, 10).map((n, i) => <li key={i}>{n.snippet}</li>)}
              </ul>
            </>
          )}

          {blockers === 0 && <div className="notice ok">확인이 필요한 항목이 없습니다.</div>}

          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
            검증 완료된 수치 {report.verifiedCount}건 (입력하신 기업 정보와 일치)
          </div>
        </div>

        <div className="card rubric" style={{ marginTop: 12, position: 'static' }}>
          <b style={{ fontSize: 13 }}>다음 단계</b>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <a className="btn" href={`/api/export?applicationId=${props.applicationId}`}>
              마크다운으로 내려받기
            </a>
            <button className="btn" onClick={regenerate} disabled={busy === 'regen'}>
              {busy === 'regen' ? '재생성 중…' : '처음부터 다시 생성'}
            </button>
            {review.status ? (
              <div className="notice ok">
                전문가 검수 <b>{statusLabel(review.status)}</b>
                {review.due && <> · 예상 완료 {review.due}</>}
              </div>
            ) : (
              <button className="btn primary" onClick={requestReview} disabled={busy === 'review'}>
                {busy === 'review' ? '요청 중…' : '전문가 최종 검수 요청'}
              </button>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              검수는 표준 3영업일이며 건당 정액입니다. 대리 접수는 제공하지 않으며,
              최종 작성·제출 책임은 신청 기업에 있습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function statusLabel(s: string): string {
  return { queued: '대기 중', in_progress: '검수 중', done: '완료' }[s] ?? s;
}
