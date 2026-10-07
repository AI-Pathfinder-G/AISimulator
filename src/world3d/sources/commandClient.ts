// 명령 API 호출 계층. showcase 는 DB·명령 API·LLM 요청을 보낼 수 없다 (설계문서 4.1, V06).
import type { SceneMode } from '../../shared/render-contracts';

export class ShowcaseIsolationError extends Error {
  constructor(what: string) {
    super(`showcase(연출 검증) 모드에서는 ${what} 요청을 보낼 수 없습니다`);
    this.name = 'ShowcaseIsolationError';
  }
}

export interface CommandClient {
  readonly mode: SceneMode;
  advanceDays(days: number): Promise<unknown>;
  sendIntervention(kind: string, payload: unknown): Promise<unknown>;
  askAi(prompt: string): Promise<unknown>;
}

type FetchLike = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<{ json(): Promise<unknown> }>;

export const API_BASE = 'http://127.0.0.1:4310';

export function createCommandClient(mode: SceneMode, fetchImpl: FetchLike = (u, i) => fetch(u, i)): CommandClient {
  if (mode !== 'simulation') {
    const deny = (what: string) => () => Promise.reject(new ShowcaseIsolationError(what));
    return { mode, advanceDays: deny('시간 진행'), sendIntervention: deny('개입'), askAi: deny('AI') };
  }
  const post = (path: string, body: unknown) =>
    fetchImpl(`${API_BASE}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }).then((r) => r.json());
  return {
    mode,
    advanceDays: (days) => post('/api/world/advance', { days }),
    sendIntervention: (kind, payload) => post('/api/world/intervention', { kind, payload }),
    // G0~G5 동안 앱 내부 LLM 호출은 0회 (설계문서 11장). simulation 에서도 아직 비활성.
    askAi: () => Promise.reject(new Error('AI 연결은 G6 이전 비활성')),
  };
}
