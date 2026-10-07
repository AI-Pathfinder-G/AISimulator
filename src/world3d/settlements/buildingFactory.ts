// 건물 외형: 시대(농경·석조·현대) × 상태(공사·완공·손상·폐허·복구) (설계문서 6.1, 6.2)
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, type AbstractMesh } from '@babylonjs/core';
import type { BuildingView, Era, SettlementView } from '../../shared/render-contracts';
import type { AssetLibrary } from '../assets/assetLibrary';
import { groundY } from '../terrain/heightmap';
import { farmFences } from '../terrain/navGrid';
import { mulberry32, hashString } from '../../shared/rng';

/** 모듈 1칸 = 1.6 게임 단위 (Fantasy Town Kit 1×1 조각 기준) */
export const CELL = 1.6;

/** 벽 조각은 로더 변환 후 로컬 -X 쪽에 위치. 바깥 방향(dx,dz)으로 향하게 하는 yaw */
function wallYaw(dx: number, dz: number): number { return Math.atan2(dz, -dx); }

export const BUILDING_ASSETS = [
  'town/wall-wood', 'town/wall-wood-door', 'town/wall-wood-window-glass', 'town/wall-wood-window-shutters',
  'town/wall', 'town/wall-door', 'town/wall-window-glass', 'town/wall-window-round', 'town/wall-broken', 'town/wall-wood-broken',
  'town/roof-gable', 'town/roof-high-gable', 'town/roof-point', 'town/roof-high-point',
  'town/windmill', 'town/fountain-round', 'town/banner-red', 'town/banner-green', 'town/stall-red', 'town/stall-green',
  'town/fence', 'town/poles', 'town/planks', 'town/lantern', 'town/pillar-stone', 'town/rock-small',
  'suburban/building-type-a', 'suburban/building-type-c', 'suburban/building-type-f', 'suburban/building-type-j',
  'suburban/building-type-m', 'suburban/building-type-p', 'suburban/building-type-t', 'suburban/planter', 'suburban/tree-small',
];

export interface BuildingVisual {
  id: string;
  root: TransformNode;
  pickMeshes: AbstractMesh[];
  roofMeshes: AbstractMesh[];
  smokeAnchor: Vector3;
  topY: number;
  dispose(): void;
}

export interface FactoryShared {
  scene: Scene;
  lib: AssetLibrary;
  mats: { soil: StandardMaterial; crop: StandardMaterial; cropModern: StandardMaterial; scaffold: StandardMaterial; progressBg: StandardMaterial; progressFg: StandardMaterial; planned: StandardMaterial; emblemSun: StandardMaterial; emblemLeaf: StandardMaterial; flagSun: StandardMaterial; flagLeaf: StandardMaterial; rubble: StandardMaterial };
}

export function createFactoryMaterials(scene: Scene): FactoryShared['mats'] {
  const m = (name: string, c: Color3, emissive?: Color3, alpha = 1) => {
    const s = new StandardMaterial(name, scene); s.diffuseColor = c; s.specularColor = Color3.Black();
    if (emissive) s.emissiveColor = emissive; s.alpha = alpha; return s;
  };
  return {
    soil: m('soilMat', new Color3(0.45, 0.32, 0.2)),
    crop: m('cropMat', new Color3(0.78, 0.7, 0.28)),
    cropModern: m('cropModernMat', new Color3(0.36, 0.62, 0.25)),
    scaffold: m('scaffoldMat', new Color3(0.72, 0.55, 0.32)),
    progressBg: m('progBgMat', new Color3(0.1, 0.1, 0.1), new Color3(0.05, 0.05, 0.05)),
    progressFg: m('progFgMat', new Color3(0.3, 0.85, 0.35), new Color3(0.2, 0.6, 0.25)),
    planned: m('plannedMat', new Color3(0.9, 0.9, 1), new Color3(0.3, 0.3, 0.4), 0.35),
    emblemSun: m('emblemSun', new Color3(0.95, 0.65, 0.15), new Color3(0.35, 0.2, 0.02)),
    emblemLeaf: m('emblemLeaf', new Color3(0.25, 0.7, 0.35), new Color3(0.05, 0.25, 0.08)),
    flagSun: m('flagSun', new Color3(0.85, 0.25, 0.2)),
    flagLeaf: m('flagLeaf', new Color3(0.2, 0.55, 0.3)),
    rubble: m('rubbleMat', new Color3(0.28, 0.26, 0.24)),
  };
}

type PieceSet = { plain: string; door: string; window: string; broken: string; roof: string; roofTower: string; stories: (k: BuildingView['kind']) => number };

const PIECES: Record<'agrarian' | 'stone', PieceSet> = {
  agrarian: { plain: 'town/wall-wood', door: 'town/wall-wood-door', window: 'town/wall-wood-window-shutters', broken: 'town/wall-wood-broken', roof: 'town/roof-point', roofTower: 'town/roof-point', stories: (k) => (k === 'tower' ? 2 : 1) },
  stone: { plain: 'town/wall', door: 'town/wall-door', window: 'town/wall-window-glass', broken: 'town/wall-broken', roof: 'town/roof-high-point', roofTower: 'town/roof-high-point', stories: (k) => (k === 'hall' || k === 'tower' ? 2 : 1) },
};

const MODERN: Record<string, string[]> = {
  house: ['suburban/building-type-a', 'suburban/building-type-c', 'suburban/building-type-f', 'suburban/building-type-m'],
  hall: ['suburban/building-type-t'],
  storage: ['suburban/building-type-p'],
  workshop: ['suburban/building-type-j'],
  tower: ['suburban/building-type-j'],
};

function tagPick(meshes: AbstractMesh[], b: BuildingView) {
  for (const m of meshes) { m.metadata = { entityType: 'building', entityId: b.id }; m.isPickable = true; }
}

export function buildBuildingVisual(b: BuildingView, settlement: SettlementView, era: Era, sh: FactoryShared): BuildingVisual {
  const { scene, lib, mats } = sh;
  const root = new TransformNode(`bld-${b.id}`, scene);
  root.position = new Vector3(b.position.x, groundY(b.position.x, b.position.z), b.position.z);
  root.rotation.y = (b.rotationQuarter * Math.PI) / 2;
  const roofMeshes: AbstractMesh[] = [];
  const rnd = mulberry32(hashString(b.id));
  let topY = CELL;
  const status = b.status;
  const showFull = status === 'active' || status === 'damaged';
  const ruined = status === 'ruined' || status === 'repairing';
  const partial = status === 'constructing' || status === 'planned';

  const place = (id: string, x: number, y: number, z: number, yaw: number, s: number | Vector3, parent: TransformNode = root) => {
    const n = lib.clone(id, `${b.id}-${id}`, parent);
    // glTF __root__ 는 이미 회전(쿼터니언)을 갖고 있으므로 감싸는 노드로 yaw 를 준다
    const wrap = new TransformNode(`${b.id}-w`, scene);
    wrap.parent = parent; wrap.position = new Vector3(x, y, z); wrap.rotation.y = yaw;
    n.parent = wrap; n.position.setAll(0);
    if (typeof s === 'number') n.scaling.scaleInPlace(s); else n.scaling.multiplyInPlace(s);
    return wrap;
  };

  if (b.kind === 'farm') {
    const sz = { w: b.width, d: b.depth };
    const soil = MeshBuilder.CreateBox(`${b.id}-soil`, { width: sz.w, height: 0.12, depth: sz.d }, scene);
    soil.parent = root; soil.position.y = 0.03; soil.material = mats.soil; soil.receiveShadows = true;
    const rows = 6;
    for (let i = 0; i < rows; i++) {
      const row = MeshBuilder.CreateBox(`${b.id}-row${i}`, { width: sz.w - 0.6, height: 0.28, depth: 0.32 }, scene);
      row.parent = root; row.position = new Vector3(0, 0.2, -sz.d / 2 + 0.55 + (i * (sz.d - 1.1)) / (rows - 1));
      row.material = era === 'modern' ? mats.cropModern : mats.crop;
      if (ruined || status === 'damaged') row.material = mats.rubble;
    }
    // 울타리 (navGrid 와 같은 선분)
    const inv = -root.rotation.y;
    for (const seg of farmFences(b)) {
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
      const n = Math.max(1, Math.round(len / 1));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const wx = seg.a.x + (seg.b.x - seg.a.x) * t - b.position.x, wz = seg.a.z + (seg.b.z - seg.a.z) * t - b.position.z;
        const lx = wx * Math.cos(inv) + wz * Math.sin(inv), lz = -wx * Math.sin(inv) + wz * Math.cos(inv);
        const along = { x: (seg.b.x - seg.a.x) / len, z: (seg.b.z - seg.a.z) / len };
        // 울타리 판(로더 변환 후 로컬 -X 쪽, Z 방향으로 길다)을 선분 중심에 맞춘다
        const yaw = Math.atan2(along.x, along.z) - root.rotation.y;
        const f = place('town/fence', lx, 0, lz, yaw, new Vector3(1, 1.4, len / n));
        (f.getChildren()[0] as TransformNode).position.x = 0.46;
      }
    }
    if (b.variant === 0 && era !== 'modern') {
      const wm = place('town/windmill', sz.w / 2 - 0.6, 0, -sz.d / 2 - 1.0, 0, 1.3);
      wm.getChildMeshes().forEach((m) => (m.receiveShadows = true));
    }
    if (era === 'modern') place('suburban/planter', -sz.w / 2 + 0.4, 0, sz.d / 2 + 0.6, 0, 2.5);
    tagPick(root.getChildMeshes(), b);
    topY = 1;
    return finish();
  }

  if (era === 'modern' && !ruined && !partial) {
    const ids = MODERN[b.kind];
    const id = ids[b.variant % ids.length];
    // 발자국에 맞춰 크기 정규화 (기준 폭 약 1.3)
    const s = Math.min(b.width / 1.35, b.depth / 1.05) * (b.kind === 'hall' ? 1.05 : 1);
    const ys = b.kind === 'tower' ? 1.9 : b.kind === 'hall' ? 1.35 : 1;
    place(id, 0, 0, 0, Math.PI, new Vector3(s, s * ys, s));
    topY = 1.15 * s * ys;
    // 가로 시설: 가로등
    if (b.kind === 'hall' || b.kind === 'house') place('town/lantern', b.width / 2 - 0.2, 0, b.depth / 2 + 0.4, 0, 1.1);
    if (b.kind === 'hall') addFlag(b.width / 2 + 0.2, b.depth / 2 + 0.2);
  } else if (era === 'modern' && (ruined || partial)) {
    buildModular(PIECES.stone);
  } else {
    buildModular(PIECES[era as 'agrarian' | 'stone']);
    if (b.kind === 'hall' && showFull) {
      place(settlement.emblem === 'sun' ? 'town/banner-red' : 'town/banner-green', 0, CELL * 0.35, b.depth / 2 + 0.02, Math.PI / 2, CELL * 0.8);
      addEmblem(0, topY - 0.1, b.depth / 2 + 0.25);
    }
    if (b.kind === 'hall' && era === 'stone' && showFull) {
      for (const x of [-b.width / 2 - 0.25, b.width / 2 + 0.25]) place('town/pillar-stone', x, 0, b.depth / 2 + 0.25, 0, new Vector3(2, CELL * 1.6, 2));
    }
  }

  function addEmblem(x: number, y: number, z: number) {
    // 색 외의 구분: 해=원판, 잎=마름모
    const e = settlement.emblem === 'sun'
      ? MeshBuilder.CreateDisc(`${b.id}-emblem`, { radius: 0.32, tessellation: 18 }, scene)
      : MeshBuilder.CreateDisc(`${b.id}-emblem`, { radius: 0.36, tessellation: 4 }, scene);
    e.parent = root; e.position = new Vector3(x, y, z); e.rotation.y = Math.PI; e.material = settlement.emblem === 'sun' ? mats.emblemSun : mats.emblemLeaf;
    e.sideOrientation = Mesh.DOUBLESIDE;
  }
  function addFlag(x: number, z: number) {
    const pole = MeshBuilder.CreateCylinder(`${b.id}-pole`, { diameter: 0.08, height: 3.2, tessellation: 6 }, scene);
    pole.parent = root; pole.position = new Vector3(x, 1.6, z); pole.material = mats.scaffold;
    const flag = settlement.emblem === 'sun'
      ? MeshBuilder.CreateDisc(`${b.id}-flag`, { radius: 0.4, tessellation: 16, sideOrientation: Mesh.DOUBLESIDE }, scene)
      : MeshBuilder.CreatePlane(`${b.id}-flag`, { width: 0.9, height: 0.55, sideOrientation: Mesh.DOUBLESIDE }, scene);
    flag.parent = root; flag.position = new Vector3(x + 0.48, 2.9, z); flag.material = settlement.emblem === 'sun' ? mats.flagSun : mats.flagLeaf;
  }

  function buildModular(p: PieceSet) {
    const nx = Math.max(1, Math.round(b.width / CELL)), nz = Math.max(1, Math.round(b.depth / CELL));
    const stories = p.stories(b.kind) + (b.kind === 'house' && era === 'stone' && b.variant % 2 === 1 ? 1 : 0);
    if (b.kind === 'workshop' && !ruined && !partial) {
      place(settlement.emblem === 'sun' ? 'town/stall-red' : 'town/stall-green', 0, 0, 0, Math.PI, 2.0);
      topY = 2.4;
      return;
    }
    const builtStories = partial ? 1 : stories;
    const doorCell = Math.floor((nx - 1) / 2);
    for (let k = 0; k < builtStories; k++) {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cx = (i + 0.5) * CELL - (nx * CELL) / 2, cz = (j + 0.5) * CELL - (nz * CELL) / 2;
        const sides: Array<[number, number, 'front' | 'side']> = [];
        if (j === nz - 1) sides.push([0, 1, 'front']);
        if (j === 0) sides.push([0, -1, 'side']);
        if (i === nx - 1) sides.push([1, 0, 'side']);
        if (i === 0) sides.push([-1, 0, 'side']);
        for (const [dx, dz, kind] of sides) {
          let id = p.plain;
          if (ruined) id = rnd() < 0.6 ? p.broken : p.plain;
          else if (kind === 'front' && k === 0 && i === doorCell) id = p.door;
          else if (rnd() < (kind === 'front' ? 0.75 : 0.5)) id = p.window;
          const ys = ruined ? 0.35 + rnd() * 0.35 : partial ? Math.max(0.15, b.progress) : 1;
          place(id, cx, k * CELL, cz, wallYaw(dx, dz), new Vector3(CELL, CELL * ys, CELL));
        }
      }
    }
    topY = builtStories * CELL;
    if (showFull) {
      const isTower = b.kind === 'tower';
      const roof = place(isTower ? p.roofTower : p.roof, 0, topY, 0, nx >= nz ? 0 : Math.PI / 2, new Vector3((nx >= nz ? nx : nz) * CELL * 0.95, CELL * (isTower ? 1.2 : 0.95), (nx >= nz ? nz : nx) * CELL * 0.95));
      roofMeshes.push(...roof.getChildMeshes());
      topY += CELL * 0.9;
    }
    if (ruined) {
      // 잔해
      for (let r = 0; r < 5; r++) place('town/rock-small', (rnd() - 0.5) * b.width * 0.8, 0, (rnd() - 0.5) * b.depth * 0.8, rnd() * 6, 0.9 + rnd() * 0.6);
      place('town/planks', (rnd() - 0.5) * b.width * 0.5, 0.05, (rnd() - 0.5) * b.depth * 0.5, rnd() * 6, CELL * 0.8);
    }
  }

  // 공사/복구: 비계·진척 막대
  if (partial || status === 'repairing') {
    const hw = b.width / 2 + 0.15, hd = b.depth / 2 + 0.15;
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const pole = MeshBuilder.CreateCylinder(`${b.id}-scaf`, { diameter: 0.1, height: CELL * 1.6, tessellation: 6 }, scene);
      pole.parent = root; pole.position = new Vector3(x, CELL * 0.8, z); pole.material = mats.scaffold;
    }
    for (const y of [CELL * 0.55, CELL * 1.25]) for (const [w, d, x, z] of [[b.width + 0.3, 0.08, 0, -hd], [b.width + 0.3, 0.08, 0, hd], [0.08, b.depth + 0.3, -hw, 0], [0.08, b.depth + 0.3, hw, 0]] as const) {
      const bar = MeshBuilder.CreateBox(`${b.id}-scafbar`, { width: w, height: 0.07, depth: d }, scene);
      bar.parent = root; bar.position = new Vector3(x, y, z); bar.material = mats.scaffold;
    }
    const bg = MeshBuilder.CreatePlane(`${b.id}-progbg`, { width: 2.2, height: 0.22 }, scene);
    bg.parent = root; bg.position.y = CELL * 1.9; bg.billboardMode = Mesh.BILLBOARDMODE_ALL; bg.material = mats.progressBg; bg.isPickable = false;
    const fg = MeshBuilder.CreatePlane(`${b.id}-progfg`, { width: 2.1, height: 0.14 }, scene);
    fg.parent = bg; fg.position.z = -0.01; fg.scaling.x = Math.max(0.02, b.progress); fg.position.x = -1.05 * (1 - Math.max(0.02, b.progress)); fg.material = mats.progressFg; fg.isPickable = false;
    fg.metadata = { progressBar: true };
    topY = Math.max(topY, CELL * 1.9);
  }
  if (status === 'planned') {
    const box = MeshBuilder.CreateBox(`${b.id}-plan`, { width: b.width, height: 0.3, depth: b.depth }, scene);
    box.parent = root; box.position.y = 0.15; box.material = mats.planned;
  }

  tagPick(root.getChildMeshes(), b);
  return finish();

  function finish(): BuildingVisual {
    const meshes = root.getChildMeshes();
    // 손상: 그을린 재질 (일부 조각), 폐허: 전체 그을림
    if (status === 'damaged' || ruined) {
      for (const m of meshes) {
        if (!m.material || m.material.name.startsWith('prog') || m.material === mats.scaffold) continue;
        if (ruined || rnd() < 0.6) m.material = lib.variant(m.material, 'charred');
      }
    }
    for (const m of meshes) { m.receiveShadows = true; }
    return {
      id: b.id, root, pickMeshes: meshes, roofMeshes, topY,
      smokeAnchor: root.position.add(new Vector3(0, topY * 0.8, 0)),
      dispose: () => root.dispose(false, false),
    };
  }
}
