// glTF 로더·복제. 공유 재질/텍스처는 개별 인물 제거 시 dispose 하지 않는다 (설계문서 7.3).
import {
  AbstractMesh, AnimationGroup, AssetContainer, Color3, LoadAssetContainerAsync, Matrix, Mesh, PBRMaterial, Scene, TransformNode, type Material,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import { assetEntry, type ClipAlias } from './manifest';
import type { LoadToken } from './loadToken';

export interface CharacterInstance {
  root: TransformNode;
  anims: Map<string, AnimationGroup>;
  clipMap: Partial<Record<ClipAlias, string | null>>;
  meshes: AbstractMesh[];
  dispose(): void;
}

export class AssetLibrary {
  private containers = new Map<string, AssetContainer>();
  private baked = new Map<string, Mesh[]>();
  private variantCache = new Map<string, Material>();
  readonly scene: Scene;

  constructor(scene: Scene) { this.scene = scene; }

  async loadAll(ids: string[], token: LoadToken, onProgress?: (done: number, total: number) => void): Promise<boolean> {
    let done = 0;
    const results = await Promise.all(ids.map(async (id) => {
      const entry = assetEntry(id);
      const c = await token.guard(LoadAssetContainerAsync(entry.localPath, this.scene), (v) => v.dispose());
      onProgress?.(++done, ids.length);
      return [id, c] as const;
    }));
    if (token.isCancelled) { results.forEach(([, c]) => c?.dispose()); return false; }
    for (const [id, c] of results) if (c) this.containers.set(id, c);
    return true;
  }

  has(id: string) { return this.containers.has(id); }
  get loadedCount() { return this.containers.size; }

  container(id: string): AssetContainer {
    const c = this.containers.get(id);
    if (!c) throw new Error(`asset not loaded: ${id}`);
    return c;
  }

  /** 정적 모델 복제 (지오메트리·재질 공유) */
  clone(id: string, name: string, parent?: TransformNode): TransformNode {
    const inst = this.container(id).instantiateModelsToScene((n) => `${name}:${n}`, false, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode;
    if (parent) root.parent = parent;
    return root;
  }

  /** thin instance 용으로 변환을 정점에 구운 메시 (자연물 반복 재사용) */
  bakedMeshes(id: string): Mesh[] {
    const hit = this.baked.get(id);
    if (hit) return hit;
    const root = this.clone(id, `baked-${id}`);
    root.computeWorldMatrix(true);
    const out: Mesh[] = [];
    for (const m of root.getChildMeshes(false)) {
      if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      const wm = m.getWorldMatrix().clone();
      m.setParent(null);
      m.position.setAll(0); m.rotationQuaternion = null; m.rotation.setAll(0); m.scaling.setAll(1);
      m.bakeTransformIntoVertices(wm);
      m.setEnabled(false); // thin instance 가 붙기 전까지 원본은 그리지 않음
      out.push(m);
    }
    root.dispose(false, false);
    this.baked.set(id, out);
    return out;
  }

  addThinInstances(id: string, matrices: Matrix[]): Mesh[] {
    const meshes = this.bakedMeshes(id);
    const buf = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    for (const m of meshes) { m.thinInstanceSetBuffer('matrix', buf, 16, true); m.isPickable = false; m.setEnabled(true); }
    return meshes;
  }

  /** 리깅 캐릭터: 인물별 독립 스켈레톤·애니메이션 그룹 */
  character(id: string, name: string): CharacterInstance {
    const entry = assetEntry(id);
    const inst = this.container(id).instantiateModelsToScene((n) => `${name}:${n}`, false, { doNotInstantiate: true });
    const glRoot = inst.rootNodes[0] as TransformNode;
    const root = new TransformNode(name, this.scene);
    glRoot.parent = root;
    const s = entry.modelScale ?? 1;
    glRoot.scaling.scaleInPlace(s);
    glRoot.position.y = entry.footOffset ?? 0;
    glRoot.rotation.y += entry.forwardYawOffset ?? 0;
    const anims = new Map<string, AnimationGroup>();
    for (const g of inst.animationGroups) { g.stop(); anims.set(g.name.split(':').pop()!, g); }
    const meshes = root.getChildMeshes(false);
    return {
      root, anims, clipMap: entry.clips ?? {}, meshes,
      dispose: () => { inst.animationGroups.forEach((g) => g.dispose()); inst.skeletons.forEach((sk) => sk.dispose()); root.dispose(false, false); },
    };
  }

  /** 재질 변형(그을림/적설) 캐시. 원본 공유 재질은 건드리지 않는다 */
  variant(mat: Material, kind: 'charred' | 'snow'): Material {
    const key = `${mat.uniqueId}:${kind}`;
    const hit = this.variantCache.get(key);
    if (hit) return hit;
    const v = mat.clone(`${mat.name}-${kind}`) as Material;
    if (v instanceof PBRMaterial) {
      if (kind === 'charred') { v.albedoColor = new Color3(0.22, 0.2, 0.19); v.roughness = 1; v.emissiveTexture = null; v.emissiveColor = Color3.Black(); }
      else { v.albedoTexture = null; v.albedoColor = new Color3(0.93, 0.95, 1.0); v.roughness = 0.9; }
    }
    this.variantCache.set(key, v);
    return v;
  }

  dispose() {
    for (const c of this.containers.values()) c.dispose();
    this.containers.clear();
    for (const ms of this.baked.values()) ms.forEach((m) => m.dispose());
    this.baked.clear();
    for (const m of this.variantCache.values()) m.dispose();
    this.variantCache.clear();
  }
}
