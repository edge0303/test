import React from 'react';
import type { Verdict } from '@/lib/types';

export function VerdictBadge({ v }: { v: Verdict }) {
  if (v === 'eligible') return <span className="badge ok">✅ 지원가능</span>;
  if (v === 'needs_check') return <span className="badge warn">⚠ 확인필요</span>;
  return <span className="badge off">❌ 불가</span>;
}

export function DdayBadge({ d }: { d: number | null }) {
  if (d === null) return <span className="badge plain">상시</span>;
  if (d < 0) return <span className="badge off">마감</span>;
  if (d === 0) return <span className="badge urgent">오늘 마감</span>;
  if (d <= 3) return <span className="badge urgent">D-{d}</span>;
  if (d <= 7) return <span className="badge soon">D-{d}</span>;
  return <span className="badge plain">D-{d}</span>;
}

export function ddayClass(d: number | null): string {
  if (d === null || d > 7) return 'd-normal';
  if (d <= 3) return 'd-urgent';
  return 'd-soon';
}

export function ResultIcon({ r }: { r: 'PASS' | 'FAIL' | 'UNKNOWN' }) {
  if (r === 'PASS') return <span style={{ color: 'var(--ok)' }} title="충족">✅</span>;
  if (r === 'FAIL') return <span style={{ color: 'var(--off)' }} title="미충족">❌</span>;
  return <span style={{ color: 'var(--warn)' }} title="확인 필요">⚠</span>;
}

export function FundTypeBadge({ t }: { t: string }) {
  const map: Record<string, string> = {
    grant: '지원금', loan: '정책자금(융자)', guarantee: '보증', voucher: '바우처', etc: '기타',
  };
  return <span className="badge plain">{map[t] ?? t}</span>;
}
