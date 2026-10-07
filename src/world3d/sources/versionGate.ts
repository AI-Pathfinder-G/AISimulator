// 뒤늦은 낮은 버전 응답은 버린다 (설계문서 4.4, V04)
import type { RenderBundle } from '../../shared/render-contracts';

export function shouldAccept(current: Pick<RenderBundle, 'worldId' | 'mode' | 'worldVersion'> | null, incoming: Pick<RenderBundle, 'worldId' | 'mode' | 'worldVersion'>): boolean {
  if (!current) return true;
  if (current.worldId !== incoming.worldId || current.mode !== incoming.mode) return true; // 세계 전환
  return incoming.worldVersion > current.worldVersion;
}
