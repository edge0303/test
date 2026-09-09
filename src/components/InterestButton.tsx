'use client';

import { useState } from 'react';
import { postJson } from '@/lib/client';

export default function InterestButton({
  companyId, programId, initial,
}: { companyId: number; programId: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const json = await postJson<{ ok: boolean; interested: boolean }>(
        '/api/interest', { companyId, programId });
      if (json.ok) setOn(json.interested);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn sm" onClick={toggle} disabled={busy} title="관심 공고로 등록하면 마감 알림 대상이 됩니다">
      {on ? '★ 관심' : '☆ 관심'}
    </button>
  );
}
