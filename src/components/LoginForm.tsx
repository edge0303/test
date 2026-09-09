'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.ok) { setErr(json.message); return; }
      setMsg(json.message);
      setStep('code');
    } catch {
      setErr('요청 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json();
      if (!json.ok) { setErr(json.message); return; }
      router.push(next);
      router.refresh();
    } catch {
      setErr('인증 중 오류가 발생했습니다.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="dot" />정부지원금 레이더</div>
        </div>
      </div>

      <div className="wrap">
        <div className="form" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 21, letterSpacing: '-.03em', marginBottom: 6 }}>로그인</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 0 }}>
            이메일로 인증번호를 보내드립니다. 비밀번호는 사용하지 않습니다.
          </p>

          <div className="card" style={{ padding: 18, marginTop: 18 }}>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email" type="text" inputMode="email" autoComplete="email"
                placeholder="you@company.com" value={email}
                disabled={step === 'code'}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && step === 'email') send(); }}
              />
            </div>

            {step === 'code' && (
              <div className="field">
                <label htmlFor="code">인증번호 6자리</label>
                <input
                  id="code" type="text" inputMode="numeric" autoComplete="one-time-code"
                  placeholder="000000" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
                />
                <div className="hint">10분간 유효하며, 5회까지 입력할 수 있습니다.</div>
              </div>
            )}

            {msg && <div className="notice ok" style={{ marginBottom: 12 }}>{msg}</div>}
            {err && <div className="notice urgent" style={{ marginBottom: 12 }}>{err}</div>}

            {step === 'email' ? (
              <button className="btn primary" style={{ width: '100%', padding: 11 }}
                onClick={send} disabled={busy || email.length < 5}>
                {busy ? '보내는 중…' : '인증번호 받기'}
              </button>
            ) : (
              <>
                <button className="btn primary" style={{ width: '100%', padding: 11 }}
                  onClick={verify} disabled={busy || code.length !== 6}>
                  {busy ? '확인 중…' : '로그인'}
                </button>
                <button className="btn" style={{ width: '100%', marginTop: 8 }}
                  onClick={() => { setStep('email'); setCode(''); setMsg(null); setErr(null); }}>
                  이메일 다시 입력
                </button>
              </>
            )}
          </div>

          <div className="notice" style={{ marginTop: 14 }}>
            메일 발송을 아직 연결하지 않았다면 인증번호가 <b>서버 콘솔</b>에 출력됩니다.
            운영에서는 <code>MAIL_WEBHOOK_URL</code>을 설정하십시오.
          </div>
        </div>
      </div>
    </>
  );
}
