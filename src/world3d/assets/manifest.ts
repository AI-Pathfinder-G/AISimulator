// asset-manifest.json 접근 (실제 파일 조사 결과). 없는 클립을 정상처럼 처리하지 않는다.
import manifestJson from '../../../public/assets/asset-manifest.json';

export type ClipAlias = 'idle' | 'walk' | 'run' | 'work' | 'attack' | 'hit';

export interface AssetEntry {
  id: string; localPath: string; sourcePage: string; license: string; sha256: string; modified: boolean;
  availableClips?: string[];
  clips?: Partial<Record<ClipAlias, string | null>>;
  modelScale?: number; forwardYawOffset?: number; footOffset?: number;
}

export const ASSET_MANIFEST = manifestJson as unknown as { assets: AssetEntry[] };

export function assetEntry(id: string): AssetEntry {
  const e = ASSET_MANIFEST.assets.find((a) => a.id === id);
  if (!e) throw new Error(`asset not in manifest: ${id}`);
  return e;
}

export function characterId(model: string): string { return `characters/character-${model}`; }
