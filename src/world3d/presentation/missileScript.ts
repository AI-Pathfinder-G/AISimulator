// 시험 미사일 연출 타임라인 (설계문서 6.4): launch → flight/trail → impact → flash/fire/smoke → damaged/ruined
// 가상 게임 연출. 실제 탄도/제원 없음. 경로는 두 점을 잇는 단순 곡선.
import type { Vec2 } from '../../shared/render-contracts';

export type MissilePhase = 'launch' | 'flight' | 'aftermath' | 'done';

export const LAUNCH_TIME = 0.5;
export const FLIGHT_TIME = 2.6; // 약 2~4초 범위
export const AFTERMATH_TIME = 9; // 불/연기 일시 효과 수명

export interface Vec3 { x: number; y: number; z: number }

export class MissileFlight {
  readonly id: string;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly peak: number;
  t = 0;
  private impacted = false;

  constructor(id: string, from: Vec2, fromY: number, to: Vec2, toY: number) {
    this.id = id;
    this.from = { x: from.x, y: fromY, z: from.z };
    this.to = { x: to.x, y: toY, z: to.z };
    this.peak = Math.max(fromY, toY) + 8 + Math.hypot(to.x - from.x, to.z - from.z) * 0.18;
  }

  get phase(): MissilePhase {
    if (this.t < LAUNCH_TIME) return 'launch';
    if (this.t < LAUNCH_TIME + FLIGHT_TIME) return 'flight';
    if (this.t < LAUNCH_TIME + FLIGHT_TIME + AFTERMATH_TIME) return 'aftermath';
    return 'done';
  }

  /** 발사대에서 수직 상승 후 2차 베지어 곡선 */
  positionAt(t: number): Vec3 {
    const liftH = 2.2;
    if (t <= LAUNCH_TIME) {
      const k = Math.max(0, t) / LAUNCH_TIME;
      return { x: this.from.x, y: this.from.y + liftH * k * k, z: this.from.z };
    }
    const u = Math.min(1, (t - LAUNCH_TIME) / FLIGHT_TIME);
    const p0 = { x: this.from.x, y: this.from.y + liftH, z: this.from.z };
    const p1 = { x: (this.from.x + this.to.x) / 2, y: this.peak * 1.6, z: (this.from.z + this.to.z) / 2 };
    const p2 = this.to;
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y, z: a * p0.z + b * p1.z + c * p2.z };
  }

  get position(): Vec3 { return this.positionAt(this.t); }

  /** 진행. 명중 순간에 한 번만 true 를 반환 */
  advance(dt: number): { impactNow: boolean } {
    const before = this.t;
    this.t += Math.min(Math.max(0, dt), 0.1);
    const impactT = LAUNCH_TIME + FLIGHT_TIME;
    if (!this.impacted && before < impactT && this.t >= impactT) { this.impacted = true; return { impactNow: true }; }
    return { impactNow: false };
  }

  get hasImpacted() { return this.impacted; }
}
