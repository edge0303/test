'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';

export default function GenerateButton({
  companyId, programId, label = '지원서 만들기', className = 'btn primary sm', force = false,
}: {
  companyId: number; programId: number; label?: string; className?: string; force?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const json = await postJson<{ ok: boolean; message?: string; applicationId: number }>(
        '/api/application/generate', { companyId, programId, force });
      if (!json.ok) { setErr(json.message ?? '생성에 실패했습니다.'); return; }
      router.push(`/application/${json.applicationId}`);
    } catch {
      setErr('생성 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} onClick={run} disabled={busy}>
        {busy ? '작성·채점 중…' : label}
      </button>
      {err && <span className="badge urgent">{err}</span>}
    </>
  );
}
