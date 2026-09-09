'use client';

import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn sm" onClick={async () => {
      try { await postJson('/api/auth/logout', {}); } catch { /* 이미 만료된 세션 */ }
      router.push('/login');
      router.refresh();
    }}>로그아웃</button>
  );
}
