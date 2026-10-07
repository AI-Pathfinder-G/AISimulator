// fixture 규모가 설계문서 2.1과 일치하는지
import { describe, expect, it } from 'vitest';
import { createShowcaseFixture, doorPoint } from '../../src/fixtures/showcase/baseScene';
import { createNature } from '../../src/fixtures/showcase/nature';
import { fixture, nature, nav } from './helpers';

describe('showcase fixture (설계문서 2.1)', () => {
  it('두 마을, 각 6~10개 건물, 24명 주민', () => {
    expect(fixture.settlements).toHaveLength(2);
    for (const s of fixture.settlements) {
      const n = fixture.buildings.filter((b) => b.settlementId === s.id).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(10);
      expect(fixture.residents.filter((r) => r.settlementId === s.id)).toHaveLength(s.population);
    }
    expect(fixture.residents).toHaveLength(24);
    expect(new Set(fixture.residents.map((r) => r.id)).size).toBe(24);
  });
  it('나무·바위 100~200개', () => {
    expect(nature.length).toBeGreaterThanOrEqual(100);
    expect(nature.length).toBeLessThanOrEqual(200);
    expect(nature.some((n) => n.kind.startsWith('rock'))).toBe(true);
  });
  it('고정 seed: 두 번 생성해도 같다', () => {
    expect(createShowcaseFixture()).toEqual(createShowcaseFixture());
    expect(createNature()).toEqual(createNature());
  });
  it('시험 분대는 주민과 별도의 ID 를 갖는다 (설계문서 6.5)', () => {
    const rid = new Set(fixture.residents.map((r) => r.id));
    expect(fixture.squads).toHaveLength(2);
    for (const u of fixture.units) expect(rid.has(u.id)).toBe(false);
    for (const s of fixture.squads) expect(s.unitIds.length).toBeGreaterThan(0);
  });
  it('건물끼리 발자국이 겹치지 않고 주민 집/일터는 실존 건물', () => {
    const ids = new Set(fixture.buildings.map((b) => b.id));
    for (const r of fixture.residents) { expect(ids.has(r.homeId)).toBe(true); expect(ids.has(r.workId)).toBe(true); }
    const bs = fixture.buildings;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const d = Math.hypot(bs[i].position.x - bs[j].position.x, bs[i].position.z - bs[j].position.z);
      expect(d, `${bs[i].id} vs ${bs[j].id}`).toBeGreaterThan(2.2);
    }
  });
  it('모든 문 앞에서 마을 광장까지 걸어갈 수 있다', () => {
    for (const b of fixture.buildings.filter((x) => x.kind !== 'farm')) {
      const s = fixture.settlements.find((x) => x.id === b.settlementId)!;
      const from = nav.nearestWalkable(doorPoint(b), 1.5)!;
      const to = nav.nearestWalkable({ x: s.center.x + 2.5, z: s.center.z }, 1.5)!;
      expect(nav.findPath(from, to), b.id).not.toBeNull();
    }
  });
});
