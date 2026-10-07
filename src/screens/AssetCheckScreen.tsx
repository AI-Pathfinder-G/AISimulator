// /showcase/assets — 한 인물과 건물의 바닥 정렬·회전·조명·재질·클립 확인 (설계문서 3.2 4단계, G0)
import { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import { AssetLibrary } from '../world3d/assets/assetLibrary';
import { LoadToken } from '../world3d/assets/loadToken';
import { assetEntry } from '../world3d/assets/manifest';
import type { CharacterInstance } from '../world3d/assets/assetLibrary';
import { buildBuildingVisual, BUILDING_ASSETS, createFactoryMaterials } from '../world3d/settlements/buildingFactory';
import { createShowcaseFixture } from '../fixtures/showcase/baseScene';
import { SHOWCASE_BANNER } from '../world3d/sources/showcaseSource';

export function AssetCheckScreen() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [active, setActive] = useState('idle');
  const charRef = useRef<CharacterInstance | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.75, 0.85, 0.95, 1);
    const cam = new ArcRotateCamera('c', -Math.PI / 2.4, 1.1, 9, new Vector3(1.5, 0.8, 0), scene);
    cam.attachControl(canvas, true);
    new HemisphericLight('h', new Vector3(0, 1, 0), scene).intensity = 0.8;
    new DirectionalLight('d', new Vector3(-0.5, -1, 0.4), scene).intensity = 1.4;
    const floor = MeshBuilder.CreateGround('floor', { width: 20, height: 12 }, scene);
    const fm = new StandardMaterial('f', scene); fm.diffuseColor = new Color3(0.45, 0.65, 0.35); floor.material = fm;
    const grid = MeshBuilder.CreateBox('axis-z', { width: 0.04, height: 0.04, depth: 2 }, scene); grid.position.set(-1.5, 0.02, 1);
    const lib = new AssetLibrary(scene);
    const token = new LoadToken();
    lib.loadAll(['characters/character-male-a', ...BUILDING_ASSETS], token).then((ok) => {
      if (!ok) return;
      const c = lib.character('characters/character-male-a', 'check');
      c.root.position.set(-1.5, 0, 0);
      charRef.current = c;
      setClips(assetEntry('characters/character-male-a').availableClips ?? []);
      c.anims.get('idle')?.start(true);
      const fx = createShowcaseFixture();
      const s = fx.settlements[0];
      const sh = { scene, lib, mats: createFactoryMaterials(scene) };
      const eras = ['agrarian', 'stone', 'modern'] as const;
      eras.forEach((era, i) => {
        const b = { ...fx.buildings.find((x) => x.kind === 'house')!, position: { x: 1.5 + i * 4.2, z: 0 }, rotationQuarter: 0 as const, status: 'active' as const };
        buildBuildingVisual(b, s, era, sh);
      });
      (window as unknown as { __ASSET_CHECK__?: boolean }).__ASSET_CHECK__ = true;
    });
    engine.runRenderLoop(() => scene.render());
    const onR = () => engine.resize();
    window.addEventListener('resize', onR);
    return () => { token.cancel(); window.removeEventListener('resize', onR); charRef.current?.dispose(); lib.dispose(); scene.dispose(); engine.dispose(); };
  }, []);

  const play = (name: string) => {
    const c = charRef.current; if (!c) return;
    c.anims.forEach((g) => g.stop());
    c.anims.get(name)?.start(true);
    setActive(name);
  };

  return (
    <div className="showcase">
      <canvas ref={ref} className="world-canvas" />
      <header className="topbar"><strong>에셋 확인</strong><span className="mode-banner">{SHOWCASE_BANNER}</span><span>Kenney Mini Characters / Fantasy Town Kit / City Kit Suburban (CC0)</span></header>
      <aside className="panel left"><h2>character-male-a 클립 ({clips.length})</h2><div className="list">{clips.map((c) => <button key={c} className={active === c ? 'sel' : ''} onClick={() => play(c)}>{c}</button>)}</div>
        <p><small>왼쪽: 인물, 오른쪽: 같은 주택의 농경/석조/현대 외형. 파란 막대는 +Z(정면) 방향.</small></p></aside>
    </div>
  );
}
