// showcase 고정 seed fixture. 실제 세계 저장과 무관한 메모리 데이터 (설계문서 4.1).
import type {
  BuildingKind, BuildingView, Era, ResidentView, SettlementView, SquadView, UnitView, Vec2,
} from '../../shared/render-contracts';
import { mulberry32 } from '../../shared/rng';
import { VILLAGE_CENTERS } from '../../world3d/terrain/layout';

export const SHOWCASE_SEED = 20261003;
export const SHOWCASE_WORLD_ID = 'showcase-fixture';

/** 회전 전 발자국 (게임 좌표) */
export const FOOTPRINTS: Record<BuildingKind, { w: number; d: number }> = {
  house: { w: 3.2, d: 3.2 },
  hall: { w: 4.8, d: 3.2 },
  workshop: { w: 2.2, d: 2.2 },
  storage: { w: 3.2, d: 1.6 },
  tower: { w: 1.6, d: 1.6 },
  farm: { w: 6, d: 4.5 },
};

export interface NatureItem { id: string; kind: 'tree' | 'tree-high' | 'tree-crooked' | 'rock-large' | 'rock-small' | 'rock-wide'; x: number; z: number; rot: number; scale: number }
export interface FenceSegment { a: Vec2; b: Vec2 }

export interface ShowcaseFixture {
  worldId: string;
  seed: number;
  settlements: SettlementView[];
  buildings: BuildingView[];
  residents: ResidentView[];
  squads: SquadView[];
  units: UnitView[];
}

interface VillageSpec {
  id: string; key: 'west' | 'east'; name: string; factionId: string; factionName: string; emblem: 'sun' | 'leaf';
  roadAngle: number; // 도로가 마을로 들어오는 방향 (중심 기준)
  farmAngles: number[];
}

const VILLAGES: VillageSpec[] = [
  { id: 'settlement-haneul', key: 'west', name: '하늘마을', factionId: 'faction-sun', factionName: '해오름 연합', emblem: 'sun', roadAngle: 0, farmAngles: [Math.PI * 0.62, Math.PI * 1.3] },
  { id: 'settlement-baram', key: 'east', name: '바람마을', factionId: 'faction-leaf', factionName: '푸른잎 동맹', emblem: 'leaf', roadAngle: Math.PI, farmAngles: [Math.PI * 0.35, Math.PI * 1.72] },
];

const BUILDING_ORDER: Array<{ kind: BuildingKind; name: string }> = [
  { kind: 'hall', name: '마을회관' },
  { kind: 'house', name: '첫째 집' },
  { kind: 'workshop', name: '작업장' },
  { kind: 'house', name: '둘째 집' },
  { kind: 'storage', name: '공동 창고' },
  { kind: 'house', name: '셋째 집' },
  { kind: 'tower', name: '망루' },
  { kind: 'house', name: '넷째 집' },
];

const NAMES = [
  '김하린', '이도윤', '박서준', '최지우', '정민재', '강수아', '조은호', '윤채원', '장하준', '임서연', '한지호', '오다인',
  '서유찬', '신예린', '권태오', '황보나', '안시우', '송아린', '류건우', '전소율', '홍재민', '문가은', '배준서', '노하은',
];
const MODELS = ['female-a', 'male-a', 'female-b', 'male-b', 'female-c', 'male-c', 'female-d', 'male-d'];

function quarterFacing(dx: number, dz: number): 0 | 1 | 2 | 3 {
  // 문(앞면)은 로컬 +z. rotationQuarter q 는 y축 q*90° 회전.
  // 회전 후 앞면 방향 = (sin(q*90°), cos(q*90°))
  const ang = Math.atan2(dx, dz);
  const q = Math.round(ang / (Math.PI / 2));
  return (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

export function rotatedSize(b: Pick<BuildingView, 'width' | 'depth' | 'rotationQuarter'>): { w: number; d: number } {
  return b.rotationQuarter % 2 === 0 ? { w: b.width, d: b.depth } : { w: b.depth, d: b.width };
}

export function frontDir(q: 0 | 1 | 2 | 3): Vec2 {
  return [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }][q];
}

/** 건물 문 앞 지점 (보행 목적지) */
export function doorPoint(b: BuildingView): Vec2 {
  const f = frontDir(b.rotationQuarter);
  const off = b.depth / 2 + 0.75;
  return { x: b.position.x + f.x * off, z: b.position.z + f.z * off };
}

export function createShowcaseFixture(era: Era = 'agrarian'): ShowcaseFixture {
  const rng = mulberry32(SHOWCASE_SEED);
  const settlements: SettlementView[] = [];
  const buildings: BuildingView[] = [];
  const residents: ResidentView[] = [];

  VILLAGES.forEach((v, vi) => {
    const c = VILLAGE_CENTERS[v.key];
    settlements.push({ id: v.id, name: v.name, factionId: v.factionId, factionName: v.factionName, emblem: v.emblem, center: c, plazaRadius: 3.2, population: 12, era });
    const n = BUILDING_ORDER.length;
    const gap = Math.PI / 3.2; // 도로 진입부 비우기
    BUILDING_ORDER.forEach((spec, i) => {
      const ang = v.roadAngle + gap / 2 + ((Math.PI * 2 - gap) * (i + 0.5)) / n;
      const r = spec.kind === 'hall' ? 7.6 : spec.kind === 'tower' ? 8.6 : 7.4;
      const pos = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
      const fp = FOOTPRINTS[spec.kind];
      buildings.push({
        id: `b-${v.key}-${i}`, settlementId: v.id, name: `${v.name} ${spec.name}`, kind: spec.kind,
        position: pos, rotationQuarter: quarterFacing(c.x - pos.x, c.z - pos.z), width: fp.w, depth: fp.d,
        status: 'active', hp: 100, maxHp: 100, progress: 1, variant: Math.floor(rng() * 4),
      });
    });
    v.farmAngles.forEach((ang, fi) => {
      const pos = { x: c.x + Math.cos(ang) * 14.5, z: c.z + Math.sin(ang) * 13.5 };
      buildings.push({
        id: `b-${v.key}-farm${fi}`, settlementId: v.id, name: `${v.name} ${fi === 0 ? '동쪽' : '서쪽'} 밭`, kind: 'farm',
        position: pos, rotationQuarter: quarterFacing(c.x - pos.x, c.z - pos.z), width: FOOTPRINTS.farm.w, depth: FOOTPRINTS.farm.d,
        status: 'active', hp: 100, maxHp: 100, progress: 1, variant: fi,
      });
    });
    // 공사 중 건물 하나 (상태별 표현 확인)
    const houseIdx = vi === 0 ? 7 : 5;
    const b = buildings.find((x) => x.id === `b-${v.key}-${houseIdx}`)!;
    b.status = 'constructing';
    b.progress = 0.45;

    const houses = buildings.filter((x) => x.settlementId === v.id && x.kind === 'house');
    const byKind = (k: BuildingKind) => buildings.filter((x) => x.settlementId === v.id && x.kind === k);
    const jobs: Array<{ job: string; work: () => BuildingView }> = [
      { job: '농부', work: () => byKind('farm')[0] },
      { job: '농부', work: () => byKind('farm')[1] },
      { job: '목수', work: () => byKind('workshop')[0] },
      { job: '창고지기', work: () => byKind('storage')[0] },
      { job: '촌장', work: () => byKind('hall')[0] },
      { job: '경비', work: () => byKind('tower')[0] },
    ];
    for (let k = 0; k < 12; k++) {
      const idx = vi * 12 + k;
      const j = jobs[k % jobs.length];
      residents.push({
        id: `r-${String(idx + 1).padStart(2, '0')}`, name: NAMES[idx], job: j.job, settlementId: v.id,
        homeId: houses[k % houses.length].id, workId: j.work().id, model: MODELS[(idx + vi) % MODELS.length], alive: true,
      });
    }
  });

  // 시험 전투 분대: 24명 주민과 별도의 시험 인물 (설계문서 6.5)
  const squads: SquadView[] = [];
  const units: UnitView[] = [];
  VILLAGES.forEach((v, vi) => {
    const sid = vi === 0 ? 'squad-sun' : 'squad-leaf';
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `${sid}-${i + 1}`;
      ids.push(id);
      units.push({ id, squadId: sid, name: `${vi === 0 ? '해오름' : '푸른잎'} 시험병 ${i + 1}`, model: vi === 0 ? (i % 2 ? 'male-c' : 'male-a') : (i % 2 ? 'male-d' : 'male-b') });
    }
    squads.push({ id: sid, name: `${v.factionName} 시험 분대`, factionId: v.factionId, settlementId: v.id, unitIds: ids, strength: 100 });
  });

  return { worldId: 'showcase-fixture', seed: SHOWCASE_SEED, settlements, buildings, residents, squads, units };
}
