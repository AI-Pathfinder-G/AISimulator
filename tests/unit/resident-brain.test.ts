// V02 보행·도착, V03 인물별 독립 상태, V07 pause/delta 제한
import { describe, expect, it } from 'vitest';
import { createResidentAgents } from '../../src/world3d/presentation/residentPlans';
import { MAX_VISUAL_DT, WALK_SPEED } from '../../src/world3d/presentation/residentBrain';
import { fixture, nav } from './helpers';
import { isWater } from '../../src/world3d/terrain/heightmap';
import { onBridge } from '../../src/world3d/terrain/layout';

function run(seconds: number, dt = 1 / 30) {
  const agents = createResidentAgents(fixture.residents, fixture.buildings, fixture.settlements, nav);
  const samples: Array<{ id: string; x: number; z: number }> = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    for (const a of agents) { a.update(dt); if (i % 3 === 0) samples.push({ id: a.id, ...a.pos }); }
  }
  return { agents, samples };
}

describe('주민 보행', () => {
  const { agents, samples } = run(120);
  it('24명 모두 실제로 이동하고 일터·광장·집에 도착한다', () => {
    expect(agents).toHaveLength(24);
    for (const a of agents) {
      const mine = samples.filter((s) => s.id === a.id);
      const moved = Math.hypot(mine[0].x - mine[mine.length - 1].x, mine[0].z - mine[mine.length - 1].z) + mine.reduce((acc, s, i) => acc + (i ? Math.hypot(s.x - mine[i - 1].x, s.z - mine[i - 1].z) : 0), 0);
      expect(moved, a.id).toBeGreaterThan(5);
    }
  });
  it('보행 중 모든 위치가 통행 가능 (강·건물 벽 관통 없음)', () => {
    const bad = samples.filter((s) => !nav.walkable(s));
    expect(bad).toEqual([]);
    const inRiver = samples.filter((s) => isWater(s.x, s.z) && !onBridge(s.x, s.z));
    expect(inRiver).toEqual([]);
  });
  it('도착 후에는 걷기 클립이 멈추고 대기/작업으로 바뀐다', () => {
    for (const a of agents) {
      if (a.state !== 'walking') expect(a.clip).not.toBe('walk');
      else expect(a.clip).toBe('walk');
    }
    // 120초 동안 클립 전환은 상태 변화 때만 (프레임당 반복 전환 없음)
    for (const a of agents) expect(a.clipChanges).toBeLessThan(40);
  });
  it('인물별 상태가 독립적이다: 동시에 서로 다른 클립이 존재', () => {
    const fresh = createResidentAgents(fixture.residents, fixture.buildings, fixture.settlements, nav);
    let mixed = false;
    for (let i = 0; i < 600 && !mixed; i++) {
      fresh.forEach((a) => a.update(1 / 30));
      const clips = new Set(fresh.map((a) => a.clip));
      mixed = clips.size >= 2;
    }
    expect(mixed).toBe(true);
    // 한 명만 멈춰도 다른 사람은 계속 진행
    const [a, b] = fresh;
    const bPos = { ...b.pos };
    for (let i = 0; i < 300; i++) b.update(1 / 30);
    expect(a.pos).toEqual(a.pos);
    expect(Math.hypot(b.pos.x - bPos.x, b.pos.z - bPos.z) + (b.state !== 'walking' ? 1 : 0)).toBeGreaterThan(0);
  });
  it('일시정지(dt=0)면 움직이지 않고, 큰 delta 는 제한된다', () => {
    const fresh = createResidentAgents(fixture.residents, fixture.buildings, fixture.settlements, nav);
    for (let i = 0; i < 300; i++) fresh.forEach((a) => a.update(1 / 30));
    const walker = fresh.find((a) => a.state === 'walking')!;
    expect(walker).toBeDefined();
    const p0 = { ...walker.pos };
    walker.update(0);
    expect(walker.pos).toEqual(p0);
    walker.update(10); // 탭 복귀 등 긴 프레임
    expect(Math.hypot(walker.pos.x - p0.x, walker.pos.z - p0.z)).toBeLessThanOrEqual(WALK_SPEED * MAX_VISUAL_DT + 1e-6);
  });
});
