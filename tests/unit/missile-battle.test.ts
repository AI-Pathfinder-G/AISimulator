// G3: 미사일 타임라인, 전투 각본
import { describe, expect, it } from 'vitest';
import { MissileFlight, LAUNCH_TIME, FLIGHT_TIME, AFTERMATH_TIME } from '../../src/world3d/presentation/missileScript';
import { BattleScript } from '../../src/world3d/presentation/battleScript';
import { fixture, nav } from './helpers';
import { BRIDGE } from '../../src/world3d/terrain/layout';

describe('시험 미사일', () => {
  it('launch → flight → aftermath → done, 명중은 정확히 한 번', () => {
    const m = new MissileFlight('m', { x: 30, z: -9 }, 2, { x: -20, z: 2 }, 1);
    const phases = new Set<string>();
    let impacts = 0;
    for (let i = 0; i < 400; i++) { if (m.advance(1 / 30).impactNow) impacts++; phases.add(m.phase); }
    expect([...phases]).toEqual(['launch', 'flight', 'aftermath', 'done']);
    expect(impacts).toBe(1);
    expect(LAUNCH_TIME + FLIGHT_TIME).toBeGreaterThanOrEqual(2);
    expect(LAUNCH_TIME + FLIGHT_TIME).toBeLessThanOrEqual(4);
    expect(AFTERMATH_TIME).toBeGreaterThan(0);
  });
  it('궤적은 발사점에서 시작해 목표에서 끝나고 중간에 높이 솟는다', () => {
    const m = new MissileFlight('m', { x: 30, z: -9 }, 2, { x: -20, z: 2 }, 1);
    expect(m.positionAt(0)).toMatchObject({ x: 30, y: 2, z: -9 });
    const end = m.positionAt(LAUNCH_TIME + FLIGHT_TIME);
    expect(end.x).toBeCloseTo(-20); expect(end.z).toBeCloseTo(2); expect(end.y).toBeCloseTo(1);
    expect(m.positionAt(LAUNCH_TIME + FLIGHT_TIME / 2).y).toBeGreaterThan(10);
  });
  it('큰 delta 한 번으로 명중을 건너뛰지 않는다', () => {
    const m = new MissileFlight('m', { x: 0, z: 0 }, 0, { x: 10, z: 0 }, 0);
    let impacts = 0;
    for (let i = 0; i < 100; i++) if (m.advance(5).impactNow) impacts++;
    expect(impacts).toBe(1);
  });
});

describe('시험 전투 각본', () => {
  it('접근 → 교전(사격/피격) → 한쪽 후퇴 → 종료', () => {
    const b = new BattleScript(fixture.squads, fixture.units, nav);
    expect(b.units.every((u) => !u.visible)).toBe(true);
    expect(b.start()).toBe(true);
    expect(b.start()).toBe(false);
    const phases: string[] = [];
    let hits = 0, crossedBridge = false;
    for (let i = 0; i < 30 * 70 && b.phase !== 'done'; i++) {
      const shots = b.update(1 / 30);
      hits += shots.filter((s) => s.hit).length;
      if (phases[phases.length - 1] !== b.phase) phases.push(b.phase);
      for (const u of b.units) {
        expect(nav.walkable(u.pos), `${u.id} @ ${u.pos.x},${u.pos.z}`).toBe(true);
        if (Math.abs(u.pos.x) < 0.5 && u.pos.z >= BRIDGE.minZ && u.pos.z <= BRIDGE.maxZ) crossedBridge = true;
      }
    }
    expect(phases).toEqual(['approach', 'engage', 'retreat', 'done']);
    expect(b.shots).toBeGreaterThan(5);
    expect(hits).toBeGreaterThan(0);
    expect(b.retreatingSquad).not.toBeNull();
    expect(crossedBridge).toBe(true); // 해오름 분대는 다리로 강을 건넌다
    const loser = b.retreatingSquad!;
    const winner = fixture.squads.find((s) => s.id !== loser)!.id;
    expect(b.strength[loser]).toBeLessThanOrEqual(b.strength[winner]);
    expect(b.strength[loser]).toBeGreaterThan(0); // 사망자 숫자를 만들지 않음
  });
  it('같은 seed 는 같은 결과', () => {
    const go = () => { const b = new BattleScript(fixture.squads, fixture.units, nav); b.start(); for (let i = 0; i < 2000; i++) b.update(1 / 30); return [b.retreatingSquad, b.strength, b.shots]; };
    expect(go()).toEqual(go());
  });
});
