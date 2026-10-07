// 인물 표시: 리깅 모델 + 독립 애니메이션 상태. 클립은 상태 변화 때만 전환 (설계문서 3.3, 5.3)
import { AnimationGroup, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import type { CharacterInstance } from '../assets/assetLibrary';
import type { ClipAlias } from '../assets/manifest';
import { groundY } from '../terrain/heightmap';
import type { Vec2 } from '../../shared/render-contracts';

/** 걷기 클립 1회 재생이 커버하는 대략의 보폭 속도 (게임 단위/초, 시각 검수로 조정) */
export const WALK_CLIP_SPEED = 1.35;
export const RUN_CLIP_SPEED = 2.6;

let ringMat: StandardMaterial | null = null;

export class CharacterActor {
  readonly id: string;
  readonly inst: CharacterInstance;
  readonly root: TransformNode;
  private current: ClipAlias | null = null;
  private currentGroup: AnimationGroup | null = null;
  private flinch = 0;
  private ring: Mesh;
  clipSwitches = 0;
  lastClipName: string | null = null;

  constructor(id: string, inst: CharacterInstance, scene: Scene, entityType: 'resident' | 'unit') {
    this.id = id;
    this.inst = inst;
    this.root = inst.root;
    for (const m of inst.meshes) { m.metadata = { entityType, entityId: id }; m.isPickable = true; }
    if (!ringMat || ringMat.getScene() !== scene) {
      ringMat = new StandardMaterial('sel-ring', scene); ringMat.emissiveColor = new Color3(1, 0.9, 0.3); ringMat.disableLighting = true;
    }
    this.ring = MeshBuilder.CreateTorus(`${id}-ring`, { diameter: 0.9, thickness: 0.06, tessellation: 24 }, scene);
    this.ring.parent = this.root; this.ring.position.y = 0.05; this.ring.material = ringMat; this.ring.isPickable = false; this.ring.setEnabled(false);
  }

  setSelected(on: boolean) { this.ring.setEnabled(on); }

  /** 의미 이름 → 실제 클립. 파일에 없는 클립(hit)은 절차적 동작으로 대체 */
  play(alias: ClipAlias, speedRatio = 1) {
    if (alias === 'hit') { this.flinch = 0.45; return; }
    if (this.current === alias) { if (this.currentGroup) this.currentGroup.speedRatio = speedRatio; return; }
    const name = this.inst.clipMap[alias] ?? this.inst.clipMap.idle ?? null;
    const g = name ? this.inst.anims.get(name) : undefined;
    this.currentGroup?.stop();
    this.current = alias;
    this.currentGroup = g ?? null;
    this.lastClipName = name;
    this.clipSwitches++;
    if (g) { g.start(true, speedRatio); }
  }

  get clip(): ClipAlias | null { return this.current; }
  get playing(): boolean { return !!this.currentGroup?.isPlaying; }

  setPaused(p: boolean) {
    if (!this.currentGroup) return;
    if (p) this.currentGroup.pause(); else if (!this.currentGroup.isPlaying) this.currentGroup.play(true);
  }

  place(p: Vec2, heading: number, dt: number) {
    this.root.position.set(p.x, groundY(p.x, p.z), p.z);
    this.root.rotation.y = heading;
    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt);
      this.root.rotation.x = -Math.sin((this.flinch / 0.45) * Math.PI) * 0.35; // 피격 시 몸을 뒤로 젖힘
    } else this.root.rotation.x = 0;
  }

  setVisible(v: boolean) { this.root.setEnabled(v); }

  dispose() { this.ring.dispose(); this.inst.dispose(); }
}
