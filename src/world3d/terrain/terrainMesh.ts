// 지형/물/도로/다리 메시. 정적 지형은 한 번만 만든다 (설계문서 10.3).
import {
  Color3, Color4, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import type { Era, SettlementView, BuildingView, Vec2 } from '../../shared/render-contracts';
import { groundY, slopeAt, terrainHeight } from './heightmap';
import { BRIDGE, BRIDGE_Y, MAIN_ROAD, MAP_DEPTH, MAP_WIDTH, ROAD_HALF } from './layout';
import { doorPoint } from '../../fixtures/showcase/baseScene';

const SUB_X = 192, SUB_Z = 128;

function landColor(h: number, slope: number, x: number, z: number): Color3 {
  const n = (Math.sin(x * 0.7) * Math.cos(z * 0.9) + 1) * 0.03;
  if (h < -0.3) return new Color3(0.55, 0.5, 0.36); // 해저/강바닥 모래
  if (h < 0.35) return new Color3(0.86, 0.79, 0.56); // 해변
  if (slope > 0.9) return new Color3(0.47, 0.44, 0.4); // 바위면
  if (h > 3.2) return new Color3(0.32 + n, 0.5 + n, 0.25); // 언덕 위 짙은 풀
  return new Color3(0.42 + n, 0.64 + n, 0.3);
}

export interface TerrainHandles {
  ground: Mesh;
  water: Mesh;
  setSnow(on: boolean): void;
  setWet(on: boolean): void;
  update(t: number): void;
  dispose(): void;
}

export function createTerrain(scene: Scene): TerrainHandles {
  const ground = MeshBuilder.CreateGround('terrain', { width: MAP_WIDTH, height: MAP_DEPTH, subdivisionsX: SUB_X, subdivisionsY: SUB_Z, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainHeight(pos[i], pos[i + 2]);
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.convertToFlatShadedMesh();
  const fpos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const nrm = ground.getVerticesData(VertexBuffer.NormalKind)!;
  const colors = new Float32Array((fpos.length / 3) * 4);
  const snowColors = new Float32Array(colors.length);
  // 면(삼각형) 단위로 색 (로우폴리)
  for (let v = 0; v < fpos.length / 3; v += 3) {
    const cx = (fpos[v * 3] + fpos[v * 3 + 3] + fpos[v * 3 + 6]) / 3;
    const cy = (fpos[v * 3 + 1] + fpos[v * 3 + 4] + fpos[v * 3 + 7]) / 3;
    const cz = (fpos[v * 3 + 2] + fpos[v * 3 + 5] + fpos[v * 3 + 8]) / 3;
    const c = landColor(cy, slopeAt(cx, cz), cx, cz);
    const up = nrm[v * 3 + 1];
    const snowy = cy > 0.25 && up > 0.6;
    const s = snowy ? new Color3(0.9, 0.92, 0.97) : c.scale(0.85);
    for (let k = 0; k < 3; k++) {
      colors.set([c.r, c.g, c.b, 1], (v + k) * 4);
      snowColors.set([s.r, s.g, s.b, 1], (v + k) * 4);
    }
  }
  ground.setVerticesData(VertexBuffer.ColorKind, colors, true);
  const gmat = new StandardMaterial('terrainMat', scene);
  gmat.specularColor = new Color3(0.02, 0.02, 0.02);
  ground.material = gmat;
  ground.receiveShadows = true;
  ground.isPickable = true;
  ground.metadata = { entityType: 'ground' };
  ground.freezeWorldMatrix();

  const water = MeshBuilder.CreateGround('water', { width: 220, height: 180, subdivisions: 1 }, scene);
  water.position.y = 0.02;
  const wmat = new StandardMaterial('waterMat', scene);
  wmat.diffuseColor = new Color3(0.12, 0.36, 0.62);
  wmat.specularColor = new Color3(0.35, 0.35, 0.35);
  wmat.specularPower = 48;
  wmat.alpha = 0.82;
  water.material = wmat;
  water.isPickable = false;
  water.receiveShadows = true;

  return {
    ground, water,
    setSnow(on) { ground.setVerticesData(VertexBuffer.ColorKind, on ? snowColors : colors, true); wmat.diffuseColor = on ? new Color3(0.3, 0.45, 0.6) : new Color3(0.12, 0.36, 0.62); },
    setWet(on) { gmat.specularColor = on ? new Color3(0.14, 0.14, 0.16) : new Color3(0.02, 0.02, 0.02); gmat.specularPower = on ? 24 : 64; },
    update(t) { water.position.y = 0.02 + Math.sin(t * 0.8) * 0.03; },
    dispose() { ground.dispose(); water.dispose(); gmat.dispose(); wmat.dispose(); },
  };
}

/** 지면을 따라가는 리본 (도로/골목). 높이는 같은 샘플 함수를 쓴다 */
function groundRibbon(name: string, line: Vec2[], half: number, scene: Scene, lift = 0.05): Mesh {
  const pts: Vec2[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  pts.push(line[line.length - 1]);
  const positions: number[] = [], indices: number[] = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q.x - o.x, dz = q.z - o.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz * half, nz = dx * half;
    const l = { x: p.x + nx, z: p.z + nz }, r = { x: p.x - nx, z: p.z - nz };
    positions.push(l.x, groundY(l.x, l.z) + lift, l.z, r.x, groundY(r.x, r.z) + lift, r.z);
    if (i < pts.length - 1) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  });
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices;
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals); vd.normals = normals;
  vd.applyToMesh(m);
  m.isPickable = false;
  m.receiveShadows = true;
  return m;
}

export const ROAD_COLORS: Record<Era, Color3> = {
  agrarian: new Color3(0.6, 0.46, 0.3), // 흙길
  stone: new Color3(0.62, 0.6, 0.56), // 정돈된 돌길
  modern: new Color3(0.2, 0.21, 0.23), // 포장도로
};

export interface RoadHandles { root: TransformNode; setEra(e: Era): void; dispose(): void }

export function createRoads(scene: Scene, settlements: SettlementView[], buildings: BuildingView[]): RoadHandles {
  const root = new TransformNode('roads', scene);
  const mat = new StandardMaterial('roadMat', scene);
  mat.specularColor = new Color3(0.03, 0.03, 0.03);
  mat.zOffset = -2;
  const curbMat = new StandardMaterial('curbMat', scene);
  curbMat.diffuseColor = new Color3(0.78, 0.78, 0.76);
  curbMat.specularColor = Color3.Black();
  curbMat.zOffset = -1;
  const lineMat = new StandardMaterial('laneMat', scene);
  lineMat.diffuseColor = new Color3(0.95, 0.85, 0.35);
  lineMat.emissiveColor = new Color3(0.25, 0.22, 0.05);
  lineMat.zOffset = -3;
  const curbs: Mesh[] = [], lanes: Mesh[] = [];
  const add = (m: Mesh) => { m.parent = root; m.material = mat; return m; };

  const westOf = MAIN_ROAD.filter((p) => p.x <= BRIDGE.minX), eastOf = MAIN_ROAD.filter((p) => p.x >= BRIDGE.maxX);
  for (const [i, seg] of [westOf, eastOf].entries()) {
    const s = settlements[i];
    const line = i === 0 ? [{ x: s.center.x + 3.4, z: s.center.z }, ...seg] : [...seg, { x: s.center.x - 3.4, z: s.center.z }];
    add(groundRibbon(`road-main-${i}`, line, ROAD_HALF, scene));
    const c = groundRibbon(`curb-${i}`, line, ROAD_HALF + 0.22, scene, 0.035); c.parent = root; c.material = curbMat; curbs.push(c);
    const ln = groundRibbon(`lane-${i}`, line, 0.06, scene, 0.065); ln.parent = root; ln.material = lineMat; lanes.push(ln);
  }
  for (const s of settlements) {
    const plaza = MeshBuilder.CreateDisc(`plaza-${s.id}`, { radius: s.plazaRadius + 0.6, tessellation: 24 }, scene);
    plaza.rotation.x = Math.PI / 2; plaza.position = new Vector3(s.center.x, groundY(s.center.x, s.center.z) + 0.05, s.center.z);
    add(plaza);
    for (const b of buildings.filter((x) => x.settlementId === s.id && x.kind !== 'farm')) {
      const d = doorPoint(b);
      const dir = { x: s.center.x - d.x, z: s.center.z - d.z }; const L = Math.hypot(dir.x, dir.z);
      const end = { x: s.center.x - (dir.x / L) * (s.plazaRadius + 0.3), z: s.center.z - (dir.z / L) * (s.plazaRadius + 0.3) };
      add(groundRibbon(`path-${b.id}`, [d, end], 0.55, scene));
    }
  }
  root.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  return {
    root,
    setEra(e) {
      mat.diffuseColor = ROAD_COLORS[e];
      curbs.forEach((c) => c.setEnabled(e !== 'agrarian'));
      lanes.forEach((l) => l.setEnabled(e === 'modern'));
    },
    dispose() { root.dispose(); mat.dispose(); curbMat.dispose(); lineMat.dispose(); },
  };
}

export interface BridgeHandles { root: TransformNode; setEra(e: Era): void; dispose(): void }

export function createBridge(scene: Scene): BridgeHandles {
  const root = new TransformNode('bridge', scene);
  const w = BRIDGE.maxX - BRIDGE.minX + 0.6, d = BRIDGE.maxZ - BRIDGE.minZ;
  const cx = (BRIDGE.minX + BRIDGE.maxX) / 2, cz = (BRIDGE.minZ + BRIDGE.maxZ) / 2;
  const deck = MeshBuilder.CreateBox('bridge-deck', { width: w, height: 0.2, depth: d }, scene);
  deck.position = new Vector3(cx, BRIDGE_Y - 0.1, cz);
  const mat = new StandardMaterial('bridgeMat', scene); mat.specularColor = Color3.Black();
  deck.material = mat; deck.parent = root; deck.receiveShadows = true;
  deck.metadata = { entityType: 'ground' };
  const rails: Mesh[] = [];
  for (const z of [BRIDGE.minZ + 0.06, BRIDGE.maxZ - 0.06]) {
    const rail = MeshBuilder.CreateBox('bridge-rail', { width: w, height: 0.08, depth: 0.08 }, scene);
    rail.position = new Vector3(cx, BRIDGE_Y + 0.5, z); rail.parent = root; rail.material = mat; rails.push(rail);
    for (let x = BRIDGE.minX; x <= BRIDGE.maxX + 0.01; x += 1.4) {
      const post = MeshBuilder.CreateBox('bridge-post', { width: 0.12, height: 0.6, depth: 0.12 }, scene);
      post.position = new Vector3(x, BRIDGE_Y + 0.25, z); post.parent = root; post.material = mat;
    }
  }
  for (const x of [-1.6, 1.6]) for (const z of [BRIDGE.minZ + 0.3, BRIDGE.maxZ - 0.3]) {
    const pier = MeshBuilder.CreateCylinder('bridge-pier', { diameter: 0.35, height: 2.2, tessellation: 8 }, scene);
    pier.position = new Vector3(x, BRIDGE_Y - 1.2, z); pier.parent = root; pier.material = mat;
  }
  return {
    root,
    setEra(e) { mat.diffuseColor = e === 'agrarian' ? new Color3(0.55, 0.38, 0.22) : e === 'stone' ? new Color3(0.6, 0.58, 0.55) : new Color3(0.5, 0.52, 0.55); },
    dispose() { root.dispose(); mat.dispose(); },
  };
}

export const SKY = new Color4(0.62, 0.8, 0.95, 1);
