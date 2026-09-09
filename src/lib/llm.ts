/**
 * Anthropic API 클라이언트 (선택적).
 * 키가 없으면 앱은 '결정적 템플릿 모드' 로 완전히 동작한다.
 * 이 경계를 유지하는 이유: 데모/오프라인에서도 전체 흐름이 끊기지 않아야 하고,
 * LLM 장애가 서비스 중단으로 이어지면 안 되기 때문이다.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function llmModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

export interface LlmOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callLlm(opts: LlmOptions): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: llmModel(),
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.3,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[llm] HTTP', res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    console.error('[llm] 호출 실패 — 템플릿 모드로 폴백합니다.', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 응답에서 JSON 블록만 뽑아낸다. 실패하면 null → 호출부가 결정적 경로로 폴백. */
export function extractJson<T>(text: string | null): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const sliced = candidate.slice(start);
  try {
    return JSON.parse(sliced) as T;
  } catch {
    // 뒤쪽에 잡설이 붙은 경우 균형 잡힌 지점까지만 파싱 시도
    let depth = 0;
    for (let i = 0; i < sliced.length; i++) {
      const ch = sliced[i];
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(sliced.slice(0, i + 1)) as T;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}
