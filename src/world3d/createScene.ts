// Scene/카메라/빛 구성과 showcase 연출 조립. 렌더러는 DB·Ollama·경제 규칙을 호출하지 않는다 (설계문서 4.2).
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, ParticleSystem, PBRMaterial,
  PointerEventTypes, Quaternion, Scene, ShadowGenerator, StandardMaterial, Texture, TransformNode, Vector2, Vector3, Plane, type AbstractMesh, type Material,
} from '@babylonjs/core';
import type { BuildingStatus, BuildingView, Era, TimeOfDay, Vec2, VisualEvent, WeatherKind } from '../shared/render-contracts';
import { ShowcaseSource } from './sources/showcaseSource';
import { createNature } from '../fixtures/showcase/nature';
import { buildNavGrid, type NavGrid } from './terrain/navGrid';
import { createBridge, createRoads, createTerrain } from './terrain/terrainMesh';
import { groundY } from './terrain/heightmap';
import { LAUNCH_PAD, MAIN_ROAD, MAP_DEPTH, MAP_WIDTH, VILLAGE_CENTERS } from './terrain/layout';
import { AssetLibrary } from './assets/assetLibrary';
import { LoadToken } from './assets/loadToken';
import { characterId } from './assets/manifest';
import { BUILDING_ASSETS, buildBuildingVisual, createFactoryMaterials, type BuildingVisual, type FactoryShared } from './settlements/buildingFactory';
import { CharacterActor, RUN_CLIP_SPEED, WALK_CLIP_SPEED } from './residents/characterActor';
import { createResidentAgents } from './presentation/residentPlans';
import { WALK_SPEED, type ResidentAgent } from './presentation/residentBrain';
import { BattleScript, type BattlePhase } from './presentation/battleScript';
import { FLIGHT_TIME, LAUNCH_TIME, MissileFlight } from './presentation/missileScript';
import { VisualEventQueue } from './presentation/eventQueue';
import { makeParticleTextures } from './effects/textures';
import { WeatherSystem, WEATHER_TINT } from './effects/weather';
import { DAYLIGHT, lerpPreset, type LightPreset } from './effects/daylight';
import { ExplosionPool } from './effects/explosionPool';
import { MissileVisualPool } from './effects/missileVisuals';
import { QUALITY, type QualityLevel } from './quality/quality';

export type EntityType = 'resident' | 'building' | 'settlement' | 'unit';
export interface Selection { type: EntityType; id: string }
export interface EffectOptions { shake: boolean; flash: boolean; frozenEffects: boolean; reducedMotion: boolean }

export interface SceneStats {
  fps: number; meshes: number; activeMeshes: number; particleSystems: number; activeParticles: number; lights: number; materials: number; textures: number;
  explosionSlots: number; missileSlots: number; missilesInFlight: number; battlePhase: BattlePhase; strengths: Record<string, number>;
  fixtureVersion: number; replaying: boolean; cameraTarget: { x: number; z: number }; cameraRadius: number; missileProgress: number[]; explosionsBusy: number; buildingStatuses: Record<string, BuildingStatus>; lightningCount: number; renderScale: number; webgl: number;
}

export interface LogEntry { id: number; t: number; text: string }

export interface SceneCallbacks {
  onReady?: () => void;
  onProgress?: (done: number, total: number) => void;
  onSelect?: (s: Selection | null) => void;
  onLog?: (e: LogEntry) => void;
  onError?: (msg: string) => void;
}

export class WebGLUnavailableError extends Error {}

export interface ShowcaseController {
  source: ShowcaseSource;
  setWeather(w: WeatherKind): void;
  setTimeOfDay(t: TimeOfDay): void;
  setEra(e: Era): void;
  setQuality(q: QualityLevel): void;
  setEffectOptions(o: Partial<EffectOptions>): void;
  setPaused(p: boolean): void;
  fireMissile(targetId?: string): string | null;
  replayLastMissile(): boolean;
  startBattle(): boolean;
  resetTest(): void;
  repair(buildingId: string): boolean;
  select(s: Selection | null): void;
  focus(s: Selection | 'overview'): void;
  focusPoint(x: number, z: number, radius: number): void;
  zoom(dir: 1 | -1): void;
  rotate(dir: 1 | -1): void;
  describeResident(id: string): { state: string; destination: string | null; clip: string | null } | null;
  stats(): SceneStats;
  projectToScreen(s: Selection): { x: number; y: number } | null;
  dispose(): void;
  readonly ready: Promise<boolean>;
}

const OVERVIEW = { alpha: -Math.PI / 2, beta: 0.82, radius: 78, target: new Vector3(0, 0, 2) };

export function createShowcaseScene(canvas: HTMLCanvasElement, cb: SceneCallbacks = {}): ShowcaseController {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new WebGLUnavailableError(`WebGL2 를 사용할 수 없습니다 (감지된 버전: WebGL${engine.webGLVersion}).`);
  }
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.58, 0.78, 0.95, 1);
  scene.ambientColor = new Color3(0.25, 0.25, 0.25);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0;
  scene.skipPointerMovePicking = true;

  const source = new ShowcaseSource();
  const token = new LoadToken();
  let logSeq = 0;
  const log = (text: string) => cb.onLog?.({ id: ++logSeq, t: performance.now(), text });

  // ---------- 카메라: 비스듬히 내려보기, 확대·이동·제한된 회전 ----------
  const camera = new ArcRotateCamera('cam', OVERVIEW.alpha, OVERVIEW.beta, OVERVIEW.radius, OVERVIEW.target.clone(), scene);
  camera.lowerRadiusLimit = 7; camera.upperRadiusLimit = 95;
  camera.lowerBetaLimit = 0.42; camera.upperBetaLimit = 1.18;
  camera.lowerAlphaLimit = OVERVIEW.alpha - 0.9; camera.upperAlphaLimit = OVERVIEW.alpha + 0.9;
  camera.minZ = 0.3; camera.maxZ = 400;
  camera.wheelDeltaPercentage = 0.01;
  camera.inputs.removeByType('ArcRotateCameraPointersInput');
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  camera.attachControl(canvas, true);

  // ---------- 빛 ----------
  const sun = new DirectionalLight('sun', DAYLIGHT.day.sunDir.clone(), scene);
  sun.position = new Vector3(40, 60, -30);
  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
  let quality: QualityLevel = 'medium';
  let shadowGen = new ShadowGenerator(QUALITY[quality].shadowMap, sun);
  const configureShadows = (sg: ShadowGenerator) => { sg.usePercentageCloserFiltering = true; sg.bias = 0.0015; sg.normalBias = 0.02; };
  configureShadows(shadowGen);
  sun.shadowMinZ = 1; sun.shadowMaxZ = 200;
  sun.autoCalcShadowZBounds = true;

  const tex = makeParticleTextures(scene);
  const effects: EffectOptions = { shake: true, flash: true, frozenEffects: false, reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches };
  const weather = new WeatherSystem(scene, camera, tex);
  const explosions = new ExplosionPool(scene, tex, QUALITY[quality].bigExplosions);
  const missilePool = new MissileVisualPool(scene, tex, 2);
  const queue = new VisualEventQueue('showcase', source.worldId);

  // ---------- 지형 ----------
  const bundle0 = source.bundle();
  const nature = createNature();
  const nav: NavGrid = buildNavGrid(bundle0.buildings, nature, Object.values(VILLAGE_CENTERS).map((c) => ({ ...c, r: 1.3 })));
  const terrain = createTerrain(scene);
  const roads = createRoads(scene, bundle0.settlements, bundle0.buildings);
  const bridge = createBridge(scene);
  roads.setEra(source.era); bridge.setEra(source.era);
  bridge.root.getChildMeshes().forEach((m) => shadowGen.addShadowCaster(m));

  // 발사대 (시험 미사일용 소품)
  const padRoot = new TransformNode('launch-pad', scene);
  const padY = groundY(LAUNCH_PAD.x, LAUNCH_PAD.z);
  padRoot.position = new Vector3(LAUNCH_PAD.x, padY, LAUNCH_PAD.z);
  const padMat = new StandardMaterial('padMat', scene); padMat.diffuseColor = new Color3(0.55, 0.55, 0.52); padMat.specularColor = Color3.Black();
  const slab = MeshBuilder.CreateBox('pad-slab', { width: 3, height: 0.25, depth: 3 }, scene); slab.parent = padRoot; slab.position.y = 0.12; slab.material = padMat;
  const rack = MeshBuilder.CreateBox('pad-rack', { width: 0.3, height: 2.4, depth: 0.3 }, scene); rack.parent = padRoot; rack.position.set(0.6, 1.3, 0); rack.material = padMat;
  [slab, rack].forEach((m) => { m.metadata = { entityType: 'ground' }; shadowGen.addShadowCaster(m); m.receiveShadows = true; });

  // ---------- 상태 ----------
  const lib = new AssetLibrary(scene);
  let factory: FactoryShared | null = null;
  const buildingVisuals = new Map<string, BuildingVisual>();
  const buildingStatus = new Map<string, BuildingStatus>();
  const damageSmoke = new Map<string, ParticleSystem>();
  const plazaProps: TransformNode[] = [];
  const streetProps: TransformNode[] = [];
  const residents = new Map<string, { actor: CharacterActor; agent: ResidentAgent }>();
  const units = new Map<string, CharacterActor>();
  let battle: BattleScript | null = null;
  const missiles: Array<{ ev: VisualEvent & { kind: 'missile' }; sim: MissileFlight; slot: number | null; replay: boolean; exploded: boolean }> = [];
  let missileCounter = 0;
  let lastMissile: (VisualEvent & { kind: 'missile' }) | null = null;
  let paused = false;
  let selection: Selection | null = null;
  let shakeT = 0;
  let presentationTime = 0;
  let lightFrom: LightPreset = DAYLIGHT.day, lightTo: LightPreset = DAYLIGHT.day, lightK = 1;
  let windowGlow = 0;
  const glowMasks: Texture[] = [];
  const glowMaterials: PBRMaterial[] = [];
  let disposed = false;
  let lastSnow = false;
  let targetFocus: { target: Vector3; radius: number; t: number } | null = null;
  let fps = 0;

  const settlementsById = () => new Map(source.bundle().settlements.map((s) => [s.id, s]));

  // ---------- 건물 ----------
  const rebuildBuilding = (b: BuildingView) => {
    if (!factory) return;
    buildingVisuals.get(b.id)?.dispose();
    const s = settlementsById().get(b.settlementId)!;
    const v = buildBuildingVisual(b, s, source.era, factory);
    v.pickMeshes.forEach((m) => { if (m.getTotalVertices() > 0) shadowGen.addShadowCaster(m, false); });
    buildingVisuals.set(b.id, v);
    buildingStatus.set(b.id, b.status);
    // 손상 상태의 지속 연기 (상태 표현). 화재는 폭발 효과의 일시 효과
    damageSmoke.get(b.id)?.dispose(); damageSmoke.delete(b.id);
    if (b.status === 'damaged') {
      const ps = new ParticleSystem(`smoke-${b.id}`, 70, scene);
      ps.particleTexture = tex.smoke; ps.emitter = v.smokeAnchor.clone();
      ps.color1 = new Color4(0.25, 0.25, 0.25, 0.45); ps.color2 = new Color4(0.35, 0.34, 0.33, 0.35); ps.colorDead = new Color4(0.4, 0.4, 0.4, 0);
      ps.minSize = 0.6; ps.maxSize = 1.4; ps.minLifeTime = 2; ps.maxLifeTime = 3.5; ps.emitRate = 14;
      ps.createCylinderEmitter(0.6, 0.2, 0.2); ps.gravity = new Vector3(0.2, 0.9, 0); ps.minEmitPower = 0.3; ps.maxEmitPower = 0.6;
      ps.start();
      damageSmoke.set(b.id, ps);
    }
    applySnowToRoofs(v);
  };

  const applySnowToRoofs = (v: BuildingVisual) => {
    const snow = weather.kind === 'snow';
    for (const m of v.roofMeshes) {
      const meta = (m.metadata ?? {}) as { baseMat?: Material };
      if (!meta.baseMat && m.material) meta.baseMat = m.material;
      m.metadata = { ...m.metadata, baseMat: meta.baseMat };
      if (meta.baseMat) m.material = snow ? lib.variant(meta.baseMat, 'snow') : meta.baseMat;
    }
  };

  const rebuildEraProps = () => {
    if (!factory) return;
    plazaProps.forEach((p) => p.dispose()); plazaProps.length = 0;
    streetProps.forEach((p) => p.dispose()); streetProps.length = 0;
    const era = source.era;
    for (const s of source.bundle().settlements) {
      const n = new TransformNode(`plaza-${s.id}`, scene);
      n.position = new Vector3(s.center.x, groundY(s.center.x, s.center.z) + 0.02, s.center.z);
      const f = lib.clone('town/fountain-round', `fountain-${s.id}`, n);
      f.scaling.scaleInPlace(era === 'agrarian' ? 0.75 : 1.25);
      if (era === 'modern') for (let k = 0; k < 4; k++) {
        const p = lib.clone('suburban/planter', `planter-${s.id}-${k}`, n);
        p.position.set(Math.cos(k * 1.57 + 0.78) * 2.6, 0, Math.sin(k * 1.57 + 0.78) * 2.6); p.scaling.scaleInPlace(3);
      }
      n.getChildMeshes().forEach((m) => { shadowGen.addShadowCaster(m); m.receiveShadows = true; m.isPickable = true; m.metadata = { entityType: 'settlement', entityId: s.id }; });
      plazaProps.push(n);
    }
    if (era !== 'agrarian') {
      // 가로등: 석조=등불, 현대=가로등 간격 촘촘
      const step = era === 'modern' ? 4.5 : 8;
      for (let i = 0; i < MAIN_ROAD.length - 1; i++) {
        const a = MAIN_ROAD[i], b = MAIN_ROAD[i + 1];
        if (Math.abs(a.x) < 5 && Math.abs(b.x) < 5) continue; // 다리 구간 제외
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        for (let d = step / 2; d < L; d += step) {
          const p = { x: a.x + ((b.x - a.x) * d) / L, z: a.z + ((b.z - a.z) * d) / L };
          const nz = (b.x - a.x) / L, nx = -(b.z - a.z) / L;
          const side = Math.round(d / step) % 2 ? 1 : -1;
          const q = { x: p.x + nx * 1.6 * side, z: p.z + nz * 1.6 * side };
          if (!nav.walkable(q)) continue;
          const lamp = lib.clone('town/lantern', `lamp-${i}-${d}`);
          lamp.position = new Vector3(q.x, groundY(q.x, q.z), q.z); lamp.scaling.scaleInPlace(1.3);
          lamp.getChildMeshes().forEach((m) => (m.isPickable = false));
          streetProps.push(lamp);
        }
      }
    }
  };

  const syncBuildings = () => {
    const b = source.bundle();
    for (const bv of b.buildings) if (buildingStatus.get(bv.id) !== bv.status || !buildingVisuals.has(bv.id)) rebuildBuilding(bv);
    // 진척 막대 갱신 (복구 중)
    for (const bv of b.buildings) {
      if (bv.status !== 'repairing' && bv.status !== 'constructing') continue;
      const vis = buildingVisuals.get(bv.id);
      vis?.root.getChildMeshes().forEach((m) => { if ((m.metadata as { progressBar?: boolean } | null)?.progressBar) { m.scaling.x = Math.max(0.02, bv.progress); m.position.x = -1.05 * (1 - Math.max(0.02, bv.progress)); } });
    }
  };

  const rebuildAllBuildings = () => {
    for (const v of buildingVisuals.values()) v.dispose();
    buildingVisuals.clear(); buildingStatus.clear();
    for (const s of damageSmoke.values()) s.dispose();
    damageSmoke.clear();
    for (const b of source.bundle().buildings) rebuildBuilding(b);
    rebuildEraProps();
  };

  source.subscribe(() => { if (factory) syncBuildings(); });

  // ---------- 창문 불빛: 팔레트 텍스처에서 유리색만 골라 발광 마스크 생성 ----------
  const makeGlowMask = async (url: string): Promise<Texture | null> => {
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { return null; }
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
      const glass = b - r > 28 && b > 170 && g > 140;
      data.data[i] = glass ? 255 : 0; data.data[i + 1] = glass ? 196 : 0; data.data[i + 2] = glass ? 110 : 0; data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const t = new Texture(c.toDataURL(), scene, false, false);
    return t;
  };

  // ---------- 비동기 로드 ----------
  const characterModels = Array.from(new Set([...bundle0.residents.map((r) => r.model), ...bundle0.units.map((u) => u.model)])).map(characterId);
  const natureIds = ['town/tree', 'town/tree-high-round', 'town/tree-crooked', 'town/rock-large', 'town/rock-small', 'town/rock-wide'];
  const allIds = Array.from(new Set([...characterModels, ...BUILDING_ASSETS, ...natureIds]));

  const ready = (async () => {
    try {
      const ok = await lib.loadAll(allIds, token, (d, t) => cb.onProgress?.(d, t));
      if (!ok || disposed) return false;
      factory = { scene, lib, mats: createFactoryMaterials(scene) };
      // 자연물: thin instance (반복 모델 재사용)
      const kindToId: Record<string, string> = { tree: 'town/tree', 'tree-high': 'town/tree-high-round', 'tree-crooked': 'town/tree-crooked', 'rock-large': 'town/rock-large', 'rock-small': 'town/rock-small', 'rock-wide': 'town/rock-wide' };
      const byKind = new Map<string, Matrix[]>();
      for (const n of nature) {
        const s = n.kind.startsWith('tree') ? 1.5 * n.scale : 1.1 * n.scale;
        const m = Matrix.Compose(new Vector3(s, s, s), Quaternion.RotationYawPitchRoll(n.rot, 0, 0), new Vector3(n.x, groundY(n.x, n.z) - 0.05, n.z));
        (byKind.get(kindToId[n.kind]) ?? byKind.set(kindToId[n.kind], []).get(kindToId[n.kind])!).push(m);
      }
      for (const [id, ms] of byKind) lib.addThinInstances(id, ms).forEach((m) => { shadowGen.addShadowCaster(m); m.receiveShadows = true; });

      // 창문 발광 마스크
      for (const pack of ['town', 'suburban']) {
        const mask = await makeGlowMask(`/assets/${pack}/Textures/colormap.png`);
        if (!mask || disposed) continue;
        glowMasks.push(mask);
        for (const id of allIds.filter((x) => x.startsWith(pack + '/') && !natureIds.includes(x) && !x.includes('fountain') && !x.includes('rock') && !x.includes('tree') && !x.includes('planter'))) {
          for (const mat of lib.container(id).materials) if (mat instanceof PBRMaterial) {
            mat.emissiveTexture = mask;
            const alb = mat.albedoTexture as Texture | null;
            if (alb) { mask.uScale = alb.uScale; mask.vScale = alb.vScale; mask.uOffset = alb.uOffset; mask.vOffset = alb.vOffset; }
            mat.emissiveColor = Color3.Black();
            glowMaterials.push(mat);
          }
        }
      }
      if (disposed) return false;
      rebuildAllBuildings();

      // 주민 24명: 독립 스켈레톤·애니메이션
      const b = source.bundle();
      const agents = createResidentAgents(b.residents, b.buildings, b.settlements, nav);
      b.residents.forEach((r, i) => {
        const actor = new CharacterActor(r.id, lib.character(characterId(r.model), `res-${r.id}`), scene, 'resident');
        actor.inst.meshes.forEach((m) => shadowGen.addShadowCaster(m));
        const agent = agents[i];
        actor.place(agent.pos, agent.heading, 0);
        actor.play('idle');
        residents.set(r.id, { actor, agent });
      });
      // 시험 분대 (주민과 별도)
      b.units.forEach((u) => {
        const actor = new CharacterActor(u.id, lib.character(characterId(u.model), `unit-${u.id}`), scene, 'unit');
        actor.inst.meshes.forEach((m) => shadowGen.addShadowCaster(m));
        // 시험병 표시: 머리 위 분대 색 깃 (색 + 모양)
        const sq = b.squads.find((s) => s.id === u.squadId)!;
        const sun = sq.factionId === 'faction-sun';
        const tag = sun ? MeshBuilder.CreateDisc(`${u.id}-tag`, { radius: 0.13, tessellation: 12, sideOrientation: Mesh.DOUBLESIDE }, scene) : MeshBuilder.CreateDisc(`${u.id}-tag`, { radius: 0.15, tessellation: 4, sideOrientation: Mesh.DOUBLESIDE }, scene);
        tag.parent = actor.root; tag.position.y = 1.25; tag.billboardMode = Mesh.BILLBOARDMODE_Y;
        tag.material = factory!.mats[sun ? 'flagSun' : 'flagLeaf']; tag.isPickable = false;
        const weapon = MeshBuilder.CreateBox(`${u.id}-weapon`, { width: 0.06, height: 0.06, depth: 0.55 }, scene);
        weapon.material = factory!.mats.rubble; weapon.isPickable = false;
        const hand = actor.inst.root.getDescendants(false).find((n) => n.name.endsWith('arm-right')) as TransformNode | undefined;
        if (hand) { weapon.parent = hand; weapon.position.set(0, -0.25, 0.2); } else { weapon.parent = actor.root; weapon.position.set(0.25, 0.5, 0.3); }
        units.set(u.id, actor);
        actor.play('idle');
        actor.setVisible(false);
      });
      battle = new BattleScript(b.squads, b.units, nav);
      setWeather(source.weather); setTimeOfDay(source.timeOfDay, true);
      cb.onReady?.();
      log('장면 로드 완료: 주민 24명, 마을 2곳, 시험 분대 2개');
      return true;
    } catch (e) {
      if (!disposed) cb.onError?.(`에셋 로드 실패: ${(e as Error).message}`);
      return false;
    }
  })();

  // ---------- 날씨·시간 ----------
  function applyLighting() {
    const p = lerpPreset(lightFrom, lightTo, lightK);
    const w = WEATHER_TINT[weather.kind];
    const flash = weather.flashLevel;
    sun.direction.copyFrom(p.sunDir);
    sun.diffuse = p.sunColor;
    sun.intensity = p.sunIntensity * w.light;
    hemi.diffuse = p.hemiColor; hemi.groundColor = p.hemiGround;
    hemi.intensity = p.hemiIntensity * (0.6 + 0.4 * w.light) + flash * 1.4;
    const sky = new Color3(p.sky.r * w.sky.r, p.sky.g * w.sky.g, p.sky.b * w.sky.b);
    const skyF = Color3.Lerp(sky, new Color3(0.8, 0.82, 0.9), flash * 0.5);
    scene.clearColor = new Color4(skyF.r, skyF.g, skyF.b, 1);
    scene.fogColor = sky;
    scene.fogDensity = w.fog;
    windowGlow = p.windowGlow;
    const glow = new Color3(1, 0.85, 0.6).scale(windowGlow * 1.2);
    for (const m of glowMaterials) m.emissiveColor = glow;
  }

  function setWeather(w: WeatherKind) {
    source.setWeather(w);
    weather.set(w, { flash: effects.flash, reducedMotion: effects.reducedMotion, particleBudget: QUALITY[quality].particleBudget, frozen: effects.frozenEffects });
    const snow = w === 'snow';
    if (snow !== lastSnow) { terrain.setSnow(snow); lastSnow = snow; for (const v of buildingVisuals.values()) applySnowToRoofs(v); }
    terrain.setWet(w === 'rain' || w === 'storm');
    log(`날씨: ${({ clear: '맑음', rain: '비', snow: '눈', storm: '폭풍' })[w]}`);
  }

  function setTimeOfDay(t: TimeOfDay, instant = false) {
    source.setTimeOfDay(t);
    lightFrom = lerpPreset(lightFrom, lightTo, lightK);
    lightTo = DAYLIGHT[t];
    lightK = instant ? 1 : 0;
    log(`시간: ${({ day: '낮', sunset: '석양', night: '밤' })[t]}`);
  }

  // ---------- 미사일 ----------
  function targetBuilding(id?: string): BuildingView | null {
    const bs = source.bundle().buildings;
    if (id) return bs.find((b) => b.id === id) ?? null;
    const candidates = bs.filter((b) => b.settlementId === 'settlement-haneul' && b.kind !== 'farm' && b.status !== 'ruined');
    return candidates[missileCounter % Math.max(1, candidates.length)] ?? bs.find((b) => b.kind !== 'farm') ?? null;
  }

  function launch(ev: VisualEvent & { kind: 'missile' }, replay: boolean): boolean {
    if (missiles.filter((m) => !m.sim.hasImpacted).length >= 2) { log('시험 미사일: 동시 최대 2발 — 요청 생략'); return false; }
    const b = source.building(ev.payload.targetBuildingId)!;
    const vis = buildingVisuals.get(b.id);
    const toY = groundY(b.position.x, b.position.z) + Math.min(2.5, (vis?.topY ?? 2) * 0.6);
    const sim = new MissileFlight(ev.id, ev.payload.from, padY + 0.3, ev.payload.to, toY);
    missiles.push({ ev, sim, slot: missilePool.acquire(), replay, exploded: false });
    return true;
  }

  function fireMissile(targetId?: string): string | null {
    const b = targetBuilding(targetId);
    if (!b || b.kind === 'farm') { log('시험 미사일: 대상 건물이 없습니다'); return null; }
    const id = `test-missile-${++missileCounter}`;
    const ev: VisualEvent & { kind: 'missile' } = {
      id, mode: 'showcase', sourceEventId: null, worldVersion: source.version, day: 0, kind: 'missile', actorIds: [], targetIds: [b.id], visualSeed: missileCounter,
      payload: { from: LAUNCH_PAD, to: b.position, targetBuildingId: b.id },
    };
    if (!queue.enqueue(ev)) return null;
    queue.drain();
    if (!launch(ev, false)) return null;
    lastMissile = ev;
    log(`시험 미사일 발사 → ${b.name}`);
    return id;
  }

  function replayLastMissile(): boolean {
    if (!lastMissile) return false;
    // 기록 연출: 같은 이벤트 ID 로 재생 → 피해 재적용 없음
    const ok = launch(lastMissile, true);
    if (ok) log('기록 연출 중: 마지막 시험 미사일 다시 보기 (피해 재적용 없음)');
    return ok;
  }

  // ---------- 입력: 드래그 이동 / 클릭 선택 ----------
  const groundPlane = Plane.FromPositionAndNormal(new Vector3(0, 1, 0), Vector3.Up());
  let pointerDown: { x: number; y: number; id: number } | null = null;
  let dragging = false;
  let lastPlanePt: Vector3 | null = null;
  const planePoint = (x: number, y: number): Vector3 | null => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    const d = ray.intersectsPlane(groundPlane);
    return d == null ? null : ray.origin.add(ray.direction.scale(d));
  };
  const clampTarget = () => {
    camera.target.x = Math.max(-MAP_WIDTH / 2 + 2, Math.min(MAP_WIDTH / 2 - 2, camera.target.x));
    camera.target.z = Math.max(-MAP_DEPTH / 2 + 2, Math.min(MAP_DEPTH / 2 - 2, camera.target.z));
    camera.target.y = Math.max(0, Math.min(6, camera.target.y));
  };
  const endDrag = () => { pointerDown = null; dragging = false; lastPlanePt = null; };
  const pickAt = (x: number, y: number): Selection | null => {
    const hit = scene.pick(x, y, (m) => m.isPickable && m.isEnabled() && !!(m.metadata as { entityId?: string } | null)?.entityId);
    if (!hit?.hit || !hit.pickedMesh) return null;
    // 자식 메시를 눌러도 root 의 엔티티 ID 로 연결
    let n: AbstractMesh | null = hit.pickedMesh;
    while (n) {
      const meta = n.metadata as { entityType?: EntityType; entityId?: string } | null;
      if (meta?.entityId && meta.entityType) return { type: meta.entityType, id: meta.entityId };
      n = n.parent as AbstractMesh | null;
    }
    return null;
  };
  scene.onPointerObservable.add((pi) => {
    const e = pi.event as PointerEvent;
    if (pi.type === PointerEventTypes.POINTERDOWN && e.button === 0) {
      pointerDown = { x: scene.pointerX, y: scene.pointerY, id: e.pointerId };
      dragging = false; lastPlanePt = planePoint(scene.pointerX, scene.pointerY);
    } else if (pi.type === PointerEventTypes.POINTERMOVE && pointerDown) {
      if ((e.buttons & 1) === 0) { endDrag(); return; } // 캔버스 밖에서 버튼을 놓은 경우 stuck 방지
      const dx = scene.pointerX - pointerDown.x, dy = scene.pointerY - pointerDown.y;
      if (!dragging && dx * dx + dy * dy > 36) dragging = true;
      if (dragging) {
        const p = planePoint(scene.pointerX, scene.pointerY);
        if (p && lastPlanePt) { camera.target.addInPlace(lastPlanePt.subtract(p)); clampTarget(); targetFocus = null; }
        lastPlanePt = planePoint(scene.pointerX, scene.pointerY);
      }
    } else if (pi.type === PointerEventTypes.POINTERUP && e.button === 0) {
      if (pointerDown && !dragging) select(pickAt(scene.pointerX, scene.pointerY)); // 드래그 후 우연한 선택 방지
      endDrag();
    }
  });
  const onWinUp = () => endDrag();
  window.addEventListener('pointerup', onWinUp);
  window.addEventListener('blur', onWinUp);
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '+' || e.key === '=') zoom(1);
    else if (e.key === '-' || e.key === '_') zoom(-1);
    else if (e.key === 'q' || e.key === 'Q') rotate(-1);
    else if (e.key === 'e' || e.key === 'E') rotate(1);
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Home' || e.key === 'f') focus('overview');
  };
  window.addEventListener('keydown', onKey);

  function select(s: Selection | null) {
    if (selection?.type === 'resident') residents.get(selection.id)?.actor.setSelected(false);
    if (selection?.type === 'unit') units.get(selection.id)?.setSelected(false);
    selection = s;
    if (s?.type === 'resident') residents.get(s.id)?.actor.setSelected(true);
    if (s?.type === 'unit') units.get(s.id)?.setSelected(true);
    cb.onSelect?.(s);
  }

  function entityPosition(s: Selection): Vector3 | null {
    if (s.type === 'resident') { const r = residents.get(s.id); return r ? r.actor.root.position.clone() : null; }
    if (s.type === 'unit') { const u = units.get(s.id); return u ? u.root.position.clone() : null; }
    if (s.type === 'building') { const b = source.building(s.id); return b ? new Vector3(b.position.x, groundY(b.position.x, b.position.z), b.position.z) : null; }
    const st = source.bundle().settlements.find((x) => x.id === s.id);
    return st ? new Vector3(st.center.x, 1, st.center.z) : null;
  }

  function focus(s: Selection | 'overview') {
    if (s === 'overview') { targetFocus = { target: OVERVIEW.target.clone(), radius: OVERVIEW.radius, t: 0 }; camera.alpha = OVERVIEW.alpha; camera.beta = OVERVIEW.beta; return; }
    const p = entityPosition(s);
    if (!p) return;
    const radius = s.type === 'resident' || s.type === 'unit' ? 9 : s.type === 'building' ? 16 : 30;
    targetFocus = { target: p.add(new Vector3(0, s.type === 'resident' || s.type === 'unit' ? 0.6 : 1, 0)), radius, t: 0 };
  }
  function zoom(dir: 1 | -1) {
    const k = dir > 0 ? 0.8 : 1.25;
    if (targetFocus) { targetFocus.radius = Math.max(camera.lowerRadiusLimit!, Math.min(camera.upperRadiusLimit!, targetFocus.radius * k)); return; }
    camera.radius = Math.max(camera.lowerRadiusLimit!, Math.min(camera.upperRadiusLimit!, camera.radius * k));
  }
  function rotate(dir: 1 | -1) { camera.alpha = Math.max(camera.lowerAlphaLimit!, Math.min(camera.upperAlphaLimit!, camera.alpha + dir * 0.3)); }

  // ---------- 프레임 ----------
  let statsAcc = 0, frames = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1); // 시각 delta 제한
    statsAcc += dt; frames++;
    if (statsAcc >= 0.5) { fps = frames / statsAcc; statsAcc = 0; frames = 0; }
    if (lightK < 1) lightK = Math.min(1, lightK + dt / 1.5);
    weather.update(dt, { flash: effects.flash, reducedMotion: effects.reducedMotion, particleBudget: QUALITY[quality].particleBudget, frozen: effects.frozenEffects });
    applyLighting();
    if (!effects.frozenEffects) { presentationTime += dt; terrain.update(presentationTime); }

    if (targetFocus) {
      targetFocus.t += dt;
      const k = Math.min(1, dt * 4);
      camera.target = Vector3.Lerp(camera.target, targetFocus.target, k);
      camera.radius += (targetFocus.radius - camera.radius) * k;
      if (targetFocus.t > 1.5) targetFocus = null;
    }
    clampTarget();

    if (!paused) {
      for (const { actor, agent } of residents.values()) {
        agent.update(dt);
        actor.play(agent.clip, agent.clip === 'walk' ? WALK_SPEED / WALK_CLIP_SPEED : 1);
        actor.place(agent.pos, agent.heading, dt);
      }
      if (battle) {
        const shots = battle.update(dt);
        for (const u of battle.units) {
          const a = units.get(u.id)!;
          a.setVisible(u.visible);
          a.play(u.clip === 'walk' ? 'walk' : u.clip === 'run' ? 'run' : u.clip === 'attack' ? 'attack' : u.clip === 'hit' ? 'hit' : 'idle', u.clip === 'walk' ? u.speed / WALK_CLIP_SPEED : u.clip === 'run' ? u.speed / RUN_CLIP_SPEED : 1);
          a.place(u.pos, u.heading, dt);
        }
        for (const s of shots) spawnTracer(s.from, s.to, s.hit);
      }
      source.tick(dt);
      for (const m of missiles) {
        const { impactNow } = m.sim.advance(dt);
        if (m.slot != null && !m.sim.hasImpacted) missilePool.place(m.slot, new Vector3(m.sim.position.x, m.sim.position.y, m.sim.position.z), effects.frozenEffects);
        if (impactNow) {
          if (m.slot != null) missilePool.hideMesh(m.slot);
          const res = source.applyImpact(m.ev.id, m.ev.payload.targetBuildingId); // replay 이면 applied=false
          const pos = new Vector3(m.sim.to.x, m.sim.to.y, m.sim.to.z);
          if (!explosions.trigger(pos)) log('폭발 효과 슬롯 가득: 연출 생략 (기록 유지)');
          if (effects.shake && !effects.reducedMotion) shakeT = 0.45;
          const b = source.building(m.ev.payload.targetBuildingId)!;
          const impactEv: VisualEvent = { id: `${m.ev.id}-impact`, mode: 'showcase', sourceEventId: null, worldVersion: source.version, day: 0, kind: 'impact', actorIds: [], targetIds: [b.id], visualSeed: 0, payload: { at: b.position, targetBuildingId: b.id, before: res.before, after: res.after } };
          queue.enqueue(impactEv); queue.drain();
          log(res.applied ? `명중: ${b.name} → ${statusKo(res.after)}` : `기록 연출 명중: ${b.name} (피해 재적용 없음)`);
        }
        if (m.sim.phase === 'done' && m.slot != null) { missilePool.release(m.slot); m.slot = null; }
      }
      for (let i = missiles.length - 1; i >= 0; i--) if (missiles[i].sim.phase === 'done') missiles.splice(i, 1);
    }
    updateTracers(dt);
    explosions.update(dt, effects.frozenEffects, effects.flash && !effects.reducedMotion);
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const a = 18 * (shakeT / 0.45);
      camera.targetScreenOffset = new Vector2((Math.random() - 0.5) * a * 0.02, (Math.random() - 0.5) * a * 0.02);
    } else if (camera.targetScreenOffset.x !== 0 || camera.targetScreenOffset.y !== 0) camera.targetScreenOffset = new Vector2(0, 0);
  });

  // 사격 효과: 재사용 예광선 풀
  const tracerMat = new StandardMaterial('tracerMat', scene); tracerMat.emissiveColor = new Color3(1, 0.9, 0.4); tracerMat.disableLighting = true;
  const muzzleMat = new StandardMaterial('muzzleMat', scene); muzzleMat.emissiveColor = new Color3(1, 0.7, 0.2); muzzleMat.disableLighting = true;
  const tracers: Array<{ mesh: Mesh; flash: Mesh; t: number; from: Vector3; to: Vector3; busy: boolean; hit: boolean }> = [];
  for (let i = 0; i < 10; i++) {
    const mesh = MeshBuilder.CreateBox(`tracer-${i}`, { width: 0.05, height: 0.05, depth: 0.6 }, scene); mesh.material = tracerMat; mesh.isPickable = false; mesh.setEnabled(false);
    const flash = MeshBuilder.CreateSphere(`muzzle-${i}`, { diameter: 0.25, segments: 6 }, scene); flash.material = muzzleMat; flash.isPickable = false; flash.setEnabled(false);
    tracers.push({ mesh, flash, t: 0, from: Vector3.Zero(), to: Vector3.Zero(), busy: false, hit: false });
  }
  function spawnTracer(fromId: string, toId: string, hit: boolean) {
    const a = units.get(fromId), b = units.get(toId);
    const tr = tracers.find((t) => !t.busy);
    if (!a || !b || !tr) return;
    tr.busy = true; tr.t = 0; tr.hit = hit;
    tr.from = a.root.position.add(new Vector3(0, 0.55, 0)); tr.to = b.root.position.add(new Vector3((Math.random() - 0.5) * (hit ? 0.1 : 1.2), 0.5, (Math.random() - 0.5) * (hit ? 0.1 : 1.2)));
    tr.mesh.setEnabled(true); tr.flash.setEnabled(true); tr.flash.position.copyFrom(tr.from);
    tr.mesh.lookAt(tr.to);
  }
  function updateTracers(dt: number) {
    for (const tr of tracers) {
      if (!tr.busy) continue;
      tr.t += dt;
      const k = Math.min(1, tr.t / 0.18);
      tr.mesh.position = Vector3.Lerp(tr.from, tr.to, k);
      tr.flash.setEnabled(tr.t < 0.07);
      if (tr.t > 0.2) { tr.busy = false; tr.mesh.setEnabled(false); tr.flash.setEnabled(false); }
    }
  }

  // ---------- 리셋 ----------
  function resetTest() {
    missiles.forEach((m) => { if (m.slot != null) missilePool.release(m.slot); });
    missiles.length = 0;
    missilePool.reset();
    explosions.reset();
    tracers.forEach((t) => { t.busy = false; t.mesh.setEnabled(false); t.flash.setEnabled(false); });
    shakeT = 0;
    source.reset(); // 시험 데이터만 복구
    lastMissile = null;
    queue.switchWorld('showcase', source.worldId);
    if (battle) {
      const b = source.bundle();
      battle = new BattleScript(b.squads, b.units, nav);
      for (const a of units.values()) { a.setVisible(false); a.play('idle'); }
    }
    syncBuildings();
    log('시험 초기화: 건물·분대·효과를 초기 상태로 복구 (날씨·시대 설정 유지)');
  }

  engine.runRenderLoop(() => { if (!disposed) scene.render(); });
  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);
  const onVis = () => { if (document.hidden) engine.stopRenderLoop(); else engine.runRenderLoop(() => { if (!disposed) scene.render(); }); };
  document.addEventListener('visibilitychange', onVis);
  engine.onContextLostObservable.add(() => cb.onError?.('WebGL 컨텍스트 손실: 복구를 기다리는 중'));

  function setQuality(q: QualityLevel) {
    quality = q;
    engine.setHardwareScalingLevel(1 / QUALITY[q].renderScale);
    const casters = shadowGen.getShadowMap()?.renderList?.slice() ?? [];
    shadowGen.dispose();
    shadowGen = new ShadowGenerator(QUALITY[q].shadowMap, sun); configureShadows(shadowGen);
    casters.forEach((m) => shadowGen.addShadowCaster(m, false));
    explosions.maxConcurrent = Math.max(explosions.slotCount, QUALITY[q].bigExplosions);
    weather.set(weather.kind, { flash: effects.flash, reducedMotion: effects.reducedMotion, particleBudget: QUALITY[q].particleBudget, frozen: effects.frozenEffects });
    log(`품질: ${QUALITY[q].label}`);
  }

  const controller: ShowcaseController = {
    source, ready,
    setWeather, setTimeOfDay: (t) => setTimeOfDay(t),
    setEra(e) { source.setEra(e); roads.setEra(e); bridge.setEra(e); rebuildAllBuildings(); log(`시대 외형 미리보기: ${({ agrarian: '농경 마을', stone: '석조 도시', modern: '현대 도시' })[e]}`); },
    setQuality,
    setEffectOptions(o) { Object.assign(effects, o); if ('flash' in o || 'reducedMotion' in o) weather.set(weather.kind, { flash: effects.flash, reducedMotion: effects.reducedMotion, particleBudget: QUALITY[quality].particleBudget, frozen: effects.frozenEffects }); },
    setPaused(p) { paused = p; for (const { actor } of residents.values()) actor.setPaused(p); for (const a of units.values()) a.setPaused(p); },
    fireMissile, replayLastMissile,
    startBattle() { const ok = !!battle?.start(); if (ok) log('시험 전투 시작: 해오름 분대 ↔ 푸른잎 분대'); else log('시험 전투: 이미 진행했거나 준비 중 (초기화 후 다시)'); return ok; },
    resetTest,
    repair(id) { const ok = source.startRepair(id); log(ok ? `시험 복구 시작: ${source.building(id)?.name}` : '복구할 수 없는 상태입니다 (손상/폐허만 가능)'); return ok; },
    select, focus, zoom, rotate,
    focusPoint(x, z, radius) { targetFocus = { target: new Vector3(x, groundY(x, z), z), radius, t: 0 }; },
    describeResident(id) { const r = residents.get(id); if (!r) return null; return { state: r.agent.state, destination: r.agent.destKind, clip: r.actor.lastClipName }; },
    stats() {
      return {
        fps, meshes: scene.meshes.length, activeMeshes: scene.getActiveMeshes().length, particleSystems: scene.particleSystems.length,
        activeParticles: weather.activeParticles + explosions.activeParticles + missilePool.activeParticles + [...damageSmoke.values()].reduce((a, p) => a + p.getActiveCount(), 0),
        lights: scene.lights.length, materials: scene.materials.length, textures: scene.textures.length,
        explosionSlots: explosions.slotCount, missileSlots: missilePool.slotCount, missilesInFlight: missiles.filter((m) => !m.sim.hasImpacted).length,
        battlePhase: battle?.phase ?? 'idle', strengths: battle ? { ...battle.strength } : {}, fixtureVersion: source.version,
        replaying: missiles.some((m) => m.replay), cameraTarget: { x: camera.target.x, z: camera.target.z }, cameraRadius: camera.radius, explosionsBusy: explosions.busyCount, missileProgress: missiles.map((m) => m.sim.t / (LAUNCH_TIME + FLIGHT_TIME)),
        buildingStatuses: Object.fromEntries(source.bundle().buildings.map((b) => [b.id, b.status])), lightningCount: weather.lightningCount, renderScale: 1 / engine.getHardwareScalingLevel(), webgl: engine.webGLVersion,
      };
    },
    projectToScreen(s) {
      const p = entityPosition(s);
      if (!p) return null;
      if (s.type === 'resident' || s.type === 'unit') p.y += 0.45;
      const v = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      const scale = engine.getHardwareScalingLevel();
      return { x: v.x * scale, y: v.y * scale };
    },
    dispose() {
      disposed = true;
      token.cancel();
      window.removeEventListener('pointerup', onWinUp); window.removeEventListener('blur', onWinUp);
      window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      engine.stopRenderLoop();
      for (const { actor } of residents.values()) actor.dispose();
      for (const a of units.values()) a.dispose();
      weather.dispose(); explosions.dispose(); missilePool.dispose(); terrain.dispose(); roads.dispose(); bridge.dispose();
      lib.dispose();
      glowMasks.forEach((t) => t.dispose());
      scene.dispose();
      engine.dispose();
    },
  };
  return controller;
}

export function statusKo(s: BuildingStatus): string {
  return ({ planned: '계획', constructing: '공사 중', active: '완공', damaged: '손상', ruined: '폐허', repairing: '복구 중' })[s];
}

export type { Vec2 };
