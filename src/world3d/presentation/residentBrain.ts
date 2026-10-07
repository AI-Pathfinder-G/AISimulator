// 주민 보행 연출 상태기계 (설계문서 5.3). 순수 로직: Babylon 의존 없음.
// 도착하면 걷기를 멈추고 대기/작업으로 전환. 상태 변화 때만 애니메이션 전환을 요청한다.
import type { Vec2 } from '../../shared/render-contracts';
import { mulberry32 } from '../../shared/rng';
import type { NavGrid } from '../terrain/navGrid';

export type AgentState = 'idle' | 'walking' | 'working';
export type AgentClip = 'idle' | 'walk' | 'work';

export const WALK_SPEED = 1.35; // 게임 단위/초
export const MAX_VISUAL_DT = 0.1; // 긴 프레임 뒤 순간이동 방지 (설계문서 5.4)

export interface Destination { kind: 'home' | 'work' | 'plaza'; pick: (rnd: () => number) => Vec2 | null; activity: 'idle' | 'work'; dwell: [number, number] }

export interface AgentSnapshot { id: string; pos: Vec2; heading: number; state: AgentState; clip: AgentClip; destination: string | null }

export class ResidentAgent {
  readonly id: string;
  pos: Vec2;
  heading = 0;
  state: AgentState = 'idle';
  clip: AgentClip = 'idle';
  path: Vec2[] = [];
  seg = 0;
  timer: number;
  noPathCount = 0;
  destKind: Destination['kind'] | null = null;
  private plan: Destination[];
  private planIdx = 0;
  private rnd: () => number;
  private nav: NavGrid;
  private pendingActivity: 'idle' | 'work' = 'idle';
  private pendingDwell: [number, number] = [2, 4];
  /** 애니메이션 전환 요청 수 (상태 변화 때만 증가해야 함) */
  clipChanges = 0;

  constructor(id: string, start: Vec2, plan: Destination[], nav: NavGrid, seed: number) {
    this.id = id;
    this.pos = { ...start };
    this.plan = plan;
    this.nav = nav;
    this.rnd = mulberry32(seed);
    this.timer = 0.5 + this.rnd() * 4; // 처음엔 잠시 대기 (서로 다른 시작 시점)
  }

  private setClip(c: AgentClip) {
    if (this.clip !== c) { this.clip = c; this.clipChanges++; }
  }

  private chooseNext(): void {
    for (let attempt = 0; attempt < this.plan.length * 2; attempt++) {
      const d = this.plan[this.planIdx % this.plan.length];
      this.planIdx++;
      const target = d.pick(this.rnd);
      if (!target) continue;
      const path = this.nav.findPath(this.pos, target);
      if (!path || path.length < 2) { this.noPathCount++; continue; } // 경로 없음: 다른 합법 목적지 선택
      this.path = path;
      this.seg = 0;
      this.state = 'walking';
      this.destKind = d.kind;
      this.pendingActivity = d.activity;
      this.pendingDwell = d.dwell;
      this.setClip('walk');
      return;
    }
    // 어떤 목적지도 경로가 없으면 그 자리에서 대기
    this.state = 'idle';
    this.setClip('idle');
    this.timer = 3;
  }

  update(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), MAX_VISUAL_DT);
    if (this.state !== 'walking') {
      this.timer -= dt;
      if (this.timer <= 0) this.chooseNext();
      return;
    }
    let remaining = WALK_SPEED * dt;
    while (remaining > 0 && this.seg < this.path.length - 1) {
      const b = this.path[this.seg + 1];
      const dx = b.x - this.pos.x, dz = b.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) this.heading = Math.atan2(dx, dz);
      if (d <= remaining) {
        this.pos = { x: b.x, z: b.z };
        remaining -= d;
        this.seg++;
      } else {
        this.pos = { x: this.pos.x + (dx / d) * remaining, z: this.pos.z + (dz / d) * remaining };
        remaining = 0;
      }
    }
    if (this.seg >= this.path.length - 1) {
      // 도착: 걷기 중지 → 대기/작업
      this.state = this.pendingActivity === 'work' ? 'working' : 'idle';
      this.setClip(this.pendingActivity === 'work' ? 'work' : 'idle');
      const [a, b] = this.pendingDwell;
      this.timer = a + this.rnd() * (b - a);
      this.path = [];
    }
  }

  snapshot(): AgentSnapshot {
    return { id: this.id, pos: { ...this.pos }, heading: this.heading, state: this.state, clip: this.clip, destination: this.destKind };
  }
}
