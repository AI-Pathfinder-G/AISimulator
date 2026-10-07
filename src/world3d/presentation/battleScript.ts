// G3 시험 전투 각본 (설계문서 6.5): 두 분대가 지정 경로로 접근 → 공격/발사 효과/피격 반응 → 한쪽 후퇴.
// 상태 전이는 메모리 fixture 전용. 프레임/메시 충돌이 결과를 바꾸지 않는다 (결과는 각본이 결정).
import type { SquadView, UnitView, Vec2 } from '../../shared/render-contracts';
import { mulberry32 } from '../../shared/rng';
import type { NavGrid } from '../terrain/navGrid';
import { BATTLE_FIELD } from '../terrain/layout';

export type BattlePhase = 'idle' | 'approach' | 'engage' | 'retreat' | 'done';
export type UnitClip = 'idle' | 'walk' | 'run' | 'attack' | 'hit';

export interface BattleUnit {
  id: string; squadId: string; pos: Vec2; heading: number; clip: UnitClip; visible: boolean;
  path: Vec2[]; seg: number; speed: number; hitTimer: number; attackTimer: number;
}
export interface ShotEvent { from: string; to: string; hit: boolean }

export const APPROACH_TIMEOUT = 22;
export const ENGAGE_TIME = 9;
export const RETREAT_TIMEOUT = 16;

export interface BattleSetup { attacker: SquadView; defender: SquadView; rally: Record<string, Vec2>; line: Record<string, Vec2>; fallback: Record<string, Vec2> }

export function defaultBattleSetup(squads: SquadView[]): BattleSetup {
  const [a, d] = squads;
  return {
    attacker: a, defender: d,
    rally: { [a.id]: { x: -13, z: 5 }, [d.id]: { x: 15, z: 4 } },
    line: { [a.id]: { x: BATTLE_FIELD.x - 3.2, z: BATTLE_FIELD.z }, [d.id]: { x: BATTLE_FIELD.x + 3.2, z: BATTLE_FIELD.z } },
    fallback: { [a.id]: { x: BATTLE_FIELD.x - 4.5, z: BATTLE_FIELD.z - 1 }, [d.id]: { x: 17, z: 4.5 } },
  };
}

export class BattleScript {
  phase: BattlePhase = 'idle';
  t = 0;
  phaseT = 0;
  units: BattleUnit[];
  strength: Record<string, number>;
  retreatingSquad: string | null = null;
  private rnd: () => number;
  private setup: BattleSetup;
  private nav: NavGrid;
  shots = 0;

  constructor(squads: SquadView[], units: UnitView[], nav: NavGrid, seed = 7) {
    this.setup = defaultBattleSetup(squads);
    this.nav = nav;
    this.rnd = mulberry32(seed);
    this.strength = Object.fromEntries(squads.map((s) => [s.id, s.strength]));
    this.units = units.map((u) => {
      const idx = squads.find((s) => s.id === u.squadId)!.unitIds.indexOf(u.id);
      const rally = this.formation(this.setup.rally[u.squadId], idx);
      return { id: u.id, squadId: u.squadId, pos: rally, heading: 0, clip: 'idle', visible: false, path: [], seg: 0, speed: 1.6, hitTimer: 0, attackTimer: 0 };
    });
  }

  private formation(c: Vec2, idx: number): Vec2 {
    const p = { x: c.x + ((idx % 2) - 0.5) * 1.1, z: c.z + (Math.floor(idx / 2) - 0.5) * 1.3 };
    return this.nav.nearestWalkable(p, 2) ?? c;
  }

  private sendTo(u: BattleUnit, target: Vec2, speed: number, clip: UnitClip): boolean {
    const path = this.nav.findPath(u.pos, target);
    if (!path) return false; // 경로 없음: 직선 관통하지 않고 제자리
    u.path = path; u.seg = 0; u.speed = speed; u.clip = clip;
    return true;
  }

  start(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'approach';
    this.phaseT = 0;
    for (const u of this.units) {
      u.visible = true;
      const idx = this.units.filter((x) => x.squadId === u.squadId).indexOf(u);
      this.sendTo(u, this.formation(this.setup.line[u.squadId], idx), 2.4, 'run');
    }
    return true;
  }

  private moveUnit(u: BattleUnit, dt: number): boolean {
    if (u.seg >= u.path.length - 1) return true;
    let remaining = u.speed * dt;
    while (remaining > 0 && u.seg < u.path.length - 1) {
      const b = u.path[u.seg + 1];
      const dx = b.x - u.pos.x, dz = b.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > 1e-6) u.heading = Math.atan2(dx, dz);
      if (d <= remaining) { u.pos = { ...b }; remaining -= d; u.seg++; } else { u.pos = { x: u.pos.x + (dx / d) * remaining, z: u.pos.z + (dz / d) * remaining }; remaining = 0; }
    }
    return u.seg >= u.path.length - 1;
  }

  private face(u: BattleUnit, p: Vec2) { u.heading = Math.atan2(p.x - u.pos.x, p.z - u.pos.z); }

  update(dtRaw: number): ShotEvent[] {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    const shots: ShotEvent[] = [];
    if (this.phase === 'idle' || this.phase === 'done') return shots;
    this.t += dt;
    this.phaseT += dt;
    let allArrived = true;
    for (const u of this.units) {
      u.hitTimer = Math.max(0, u.hitTimer - dt);
      if (u.hitTimer === 0 && u.clip === 'hit') u.clip = 'idle';
      const arrived = this.moveUnit(u, dt);
      if (arrived && (u.clip === 'walk' || u.clip === 'run')) u.clip = 'idle';
      if (!arrived) allArrived = false;
    }
    const { attacker, defender } = this.setup;
    if (this.phase === 'approach' && (allArrived || this.phaseT > APPROACH_TIMEOUT)) {
      this.phase = 'engage'; this.phaseT = 0;
    } else if (this.phase === 'engage') {
      for (const u of this.units) {
        const enemies = this.units.filter((e) => e.squadId !== u.squadId);
        u.attackTimer -= dt;
        if (u.attackTimer <= 0 && u.hitTimer === 0) {
          const target = enemies[Math.floor(this.rnd() * enemies.length)];
          this.face(u, target.pos);
          u.clip = 'attack';
          u.attackTimer = 1.1 + this.rnd() * 0.9;
          const hitChance = u.squadId === attacker.id ? 0.7 : 0.45;
          const hit = this.rnd() < hitChance;
          if (hit) {
            target.hitTimer = 0.45; target.clip = 'hit';
            this.strength[target.squadId] = Math.max(5, this.strength[target.squadId] - 4);
          }
          shots.push({ from: u.id, to: target.id, hit });
          this.shots++;
        }
      }
      if (this.phaseT > ENGAGE_TIME) {
        // 전력이 낮은 쪽이 후퇴 (각본 결과; 실제 전쟁 규칙 아님)
        this.retreatingSquad = this.strength[attacker.id] < this.strength[defender.id] ? attacker.id : defender.id;
        this.phase = 'retreat'; this.phaseT = 0;
        for (const u of this.units) {
          const idx = this.units.filter((x) => x.squadId === u.squadId).indexOf(u);
          if (u.squadId === this.retreatingSquad) this.sendTo(u, this.formation(this.setup.fallback[u.squadId], idx), 2.6, 'run');
          else { u.clip = 'idle'; this.sendTo(u, this.formation(this.setup.fallback[u.squadId], idx), 1.2, 'walk'); }
        }
      }
    } else if (this.phase === 'retreat' && (allArrived || this.phaseT > RETREAT_TIMEOUT)) {
      this.phase = 'done';
      for (const u of this.units) u.clip = 'idle';
    }
    return shots;
  }
}
