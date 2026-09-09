/** 브라우저에서 상태 변경 요청을 보낼 때 쓰는 헬퍼. CSRF 토큰을 자동으로 싣는다. */
export function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)gfr_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('unauthenticated');
  }
  return (await res.json()) as T;
}
