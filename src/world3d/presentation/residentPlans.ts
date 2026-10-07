// fixture 주민 → 보행 계획 (집·일터·광장 순환)
import type { BuildingView, ResidentView, SettlementView, Vec2 } from '../../shared/render-contracts';
import { doorPoint, rotatedSize } from '../../fixtures/showcase/baseScene';
import { hashString } from '../../shared/rng';
import type { NavGrid } from '../terrain/navGrid';
import { ResidentAgent, type Destination } from './residentBrain';

function jitter(p: Vec2, rnd: () => number, r: number): Vec2 {
  const a = rnd() * Math.PI * 2, d = rnd() * r;
  return { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
}

export function createResidentAgents(residents: ResidentView[], buildings: BuildingView[], settlements: SettlementView[], nav: NavGrid): ResidentAgent[] {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  return residents.map((r, i) => {
    const home = byId.get(r.homeId)!;
    const work = byId.get(r.workId)!;
    const s = settlements.find((x) => x.id === r.settlementId)!;
    const near = (p: Vec2) => nav.nearestWalkable(p, 1.5);
    const homeDest: Destination = { kind: 'home', activity: 'idle', dwell: [4, 9], pick: (rnd) => near(jitter(doorPoint(home), rnd, 0.6)) };
    const workDest: Destination = {
      kind: 'work', activity: 'work', dwell: [8, 14],
      pick: (rnd) => {
        if (work.kind === 'farm') {
          const sz = rotatedSize(work);
          return near({ x: work.position.x + (rnd() - 0.5) * (sz.w - 1.2), z: work.position.z + (rnd() - 0.5) * (sz.d - 1.2) });
        }
        return near(jitter(doorPoint(work), rnd, 0.7));
      },
    };
    const plazaDest: Destination = {
      kind: 'plaza', activity: 'idle', dwell: [5, 10],
      pick: (rnd) => { const a = rnd() * Math.PI * 2, d = 1.8 + rnd() * 1.4; return near({ x: s.center.x + Math.cos(a) * d, z: s.center.z + Math.sin(a) * d }); },
    };
    const start = near(jitter(doorPoint(home), () => ((i * 0.37) % 1), 0.8)) ?? doorPoint(home);
    const plan = i % 2 === 0 ? [workDest, plazaDest, workDest, homeDest] : [plazaDest, workDest, homeDest];
    return new ResidentAgent(r.id, start, plan, nav, hashString(r.id));
  });
}
