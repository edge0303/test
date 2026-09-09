'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDUSTRIES, SIDO, EMPLOYEE_BANDS, REVENUE_BANDS } from '@/lib/profile';

interface LookupResult {
  ok: boolean;
  formatted: string;
  biz_no: string;
  kind: string | null;
  nts: { available: boolean; found: boolean; b_stt: string | null; tax_type: string | null; message: string };
  existing: { id: number; name: string } | null;
  autoFilled: { label: string; value: string }[];
}

const FLAGS = [
  { key: 'is_woman_owned', label: '여성기업' },
  { key: 'is_disabled_owned', label: '장애인기업' },
  { key: 'is_social_enterprise', label: '사회적기업' },
  { key: 'is_venture_certified', label: '벤처기업 확인' },
  { key: 'has_research_institute', label: '기업부설연구소' },
] as const;

export default function OnboardPage() {
  const router = useRouter();
  const [bizNo, setBizNo] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    industry_code: '',
    region_sido: '',
    region_sigungu: '',
    founded_at: '',
    employee_band: '',
    revenue_band: '',
  });
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  async function doLookup() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/bizno/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ biz_no: bizNo }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.message); setLookup(null); return; }
      setLookup(json);
      if (json.existing) setForm((f) => ({ ...f, name: json.existing.name }));
    } catch {
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!lookup) return;
    setBusy(true); setError(null);
    try {
      const industry = INDUSTRIES.find((i) => i.code === form.industry_code);
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          biz_no: lookup.biz_no,
          industry_name: industry?.name ?? null,
          status: lookup.nts.b_stt,
          tax_type: lookup.nts.tax_type,
          ...Object.fromEntries(FLAGS.map((f) => [f.key, flags[f.key] ? '1' : '0'])),
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.message); return; }
      router.push(`/dashboard?c=${json.companyId}`);
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const ready = form.name && form.industry_code && form.region_sido && form.employee_band && form.revenue_band;

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="dot" />정부지원금 레이더</div>
        </div>
      </div>

      <div className="wrap">
        <div className="form">
          <h1 style={{ fontSize: 22, letterSpacing: '-.03em', marginBottom: 6 }}>사업자번호로 시작하기</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 0 }}>
            번호로 자동 확인되는 항목은 자동으로 채우고, 확인이 필요한 것만 여쭤봅니다.
          </p>

          <div className="card" style={{ padding: 18, marginTop: 20 }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="bizno">사업자등록번호</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="bizno" type="text" inputMode="numeric" placeholder="000-00-00000"
                  value={bizNo} onChange={(e) => setBizNo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') doLookup(); }}
                />
                <button className="btn primary" onClick={doLookup} disabled={busy || bizNo.length < 10}>
                  {busy ? '확인 중…' : '확인'}
                </button>
              </div>
              <div className="hint">체크섬 검증 후, 국세청 조회 키가 설정되어 있으면 휴·폐업 상태까지 확인합니다.</div>
            </div>

            {error && <div className="notice urgent">{error}</div>}

            {lookup && (
              <>
                <div className="notice ok" style={{ marginTop: 10 }}>
                  <b>{lookup.formatted}</b> · {lookup.nts.message}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {lookup.autoFilled.map((a) => (
                    <span className="badge accent" key={a.label}>{a.label}: {a.value}</span>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 10 }}>
                  사업자번호로 알 수 있는 것은 여기까지입니다. 업종·소재지·업력·규모는 공개 API로 조회되지 않아
                  아래에서 직접 확인해 주셔야 합니다. (유료 기업DB 연동 시 이 단계가 자동화됩니다)
                </div>
              </>
            )}
          </div>

          {lookup && (
            <div className="card" style={{ padding: 18, marginTop: 14 }}>
              <div className="field">
                <label>기업명</label>
                <input type="text" value={form.name} placeholder="(주)○○○"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="field">
                <label>1. 주요 업종</label>
                <select value={form.industry_code} onChange={(e) => setForm({ ...form, industry_code: e.target.value })}>
                  <option value="">선택하세요</option>
                  {INDUSTRIES.map((i) => <option key={i.code} value={i.code}>{i.name} ({i.code})</option>)}
                </select>
                <div className="hint">업종 제한 요건이 걸린 공고를 걸러내는 데 사용합니다.</div>
              </div>

              <div className="field">
                <label>2. 사업장 소재지</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select value={form.region_sido} onChange={(e) => setForm({ ...form, region_sido: e.target.value })}>
                    <option value="">시/도 선택</option>
                    {SIDO.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" placeholder="시/군/구 (예: 화성시)" value={form.region_sigungu}
                    onChange={(e) => setForm({ ...form, region_sigungu: e.target.value })} />
                </div>
                <div className="hint">지자체 공고 필터에 가장 큰 영향을 줍니다.</div>
              </div>

              <div className="field">
                <label>3. 개업일 (업력 산정)</label>
                <input type="date" value={form.founded_at}
                  onChange={(e) => setForm({ ...form, founded_at: e.target.value })} />
                <div className="hint">비워두면 업력 요건이 있는 공고는 &lsquo;확인필요&rsquo;로 분류됩니다.</div>
              </div>

              <div className="field">
                <label>4. 상시근로자 수</label>
                <div className="radio-row">
                  {EMPLOYEE_BANDS.map((b) => (
                    <label key={b.value}>
                      <input type="radio" name="emp" value={b.value}
                        checked={form.employee_band === b.value}
                        onChange={() => setForm({ ...form, employee_band: b.value })} />
                      {b.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>5. 직전연도 매출액</label>
                <div className="radio-row">
                  {REVENUE_BANDS.map((b) => (
                    <label key={b.value}>
                      <input type="radio" name="rev" value={b.value}
                        checked={form.revenue_band === b.value}
                        onChange={() => setForm({ ...form, revenue_band: b.value })} />
                      {b.label}
                    </label>
                  ))}
                </div>
                <div className="hint">
                  정확한 금액 대신 구간으로 받습니다. 구간이 기준선에 걸치면 &lsquo;불가&rsquo;가 아니라
                  &lsquo;확인필요&rsquo;로 분류해 놓치는 공고가 없게 합니다.
                </div>
              </div>

              <div className="field">
                <label>6. 해당사항 (가점·전용 사업 판별)</label>
                <div className="radio-row">
                  {FLAGS.map((f) => (
                    <label key={f.key}>
                      <input type="checkbox" checked={!!flags[f.key]}
                        onChange={(e) => setFlags({ ...flags, [f.key]: e.target.checked })} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              {error && <div className="notice urgent" style={{ marginBottom: 12 }}>{error}</div>}

              <button className="btn primary" style={{ width: '100%', padding: 12 }}
                onClick={submit} disabled={busy || !ready}>
                {busy ? '분석 중…' : '지원 가능한 사업 찾기'}
              </button>
              {!ready && <div className="hint" style={{ textAlign: 'center' }}>기업명·업종·소재지·근로자·매출을 입력하면 활성화됩니다.</div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
