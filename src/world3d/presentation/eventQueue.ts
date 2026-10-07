// 연출 큐: mode + worldId + eventId 로 중복 제거, 기록은 범위 제한 (설계문서 7.2)
import type { SceneMode, VisualEvent } from '../../shared/render-contracts';

export class VisualEventQueue {
  private seen = new Set<string>();
  private order: string[] = [];
  private pending: VisualEvent[] = [];
  private worldId: string;
  private mode: SceneMode;
  readonly maxHistory: number;
  readonly maxPending: number;
  skipped = 0;

  constructor(mode: SceneMode, worldId: string, maxHistory = 256, maxPending = 8) {
    this.mode = mode;
    this.worldId = worldId;
    this.maxHistory = maxHistory;
    this.maxPending = maxPending;
  }

  key(e: Pick<VisualEvent, 'mode' | 'id'>): string { return `${e.mode}|${this.worldId}|${e.id}`; }

  /** 같은 이벤트면 false. 다른 world/mode 의 이벤트는 거부 */
  enqueue(e: VisualEvent): boolean {
    if (e.mode !== this.mode) return false;
    const k = this.key(e);
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    this.order.push(k);
    while (this.order.length > this.maxHistory) this.seen.delete(this.order.shift()!);
    if (this.pending.length >= this.maxPending) { this.pending.shift(); this.skipped++; } // 기록은 남고 연출만 생략
    this.pending.push(e);
    return true;
  }

  drain(): VisualEvent[] { const p = this.pending; this.pending = []; return p; }

  /** world/mode 변경 시 큐와 중복 기록을 비운다 */
  switchWorld(mode: SceneMode, worldId: string): void {
    this.mode = mode;
    this.worldId = worldId;
    this.seen.clear();
    this.order = [];
    this.pending = [];
  }

  get historySize(): number { return this.order.length; }
  get pendingSize(): number { return this.pending.length; }
}
