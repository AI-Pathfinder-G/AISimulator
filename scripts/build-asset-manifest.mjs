// 사용 중인 에셋 파일을 조사해 public/assets/asset-manifest.json 생성 (설계문서 3.2~3.3).
// 실제 GLB 내부의 애니메이션 클립·외부 텍스처·체크섬을 기록한다. Node 전용, OS 무관.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../public/assets/', import.meta.url).pathname;
const PACKS = {
  characters: { name: 'Kenney Mini Characters 1.0', sourcePage: 'https://kenney.nl/assets/mini-characters', license: 'CC0-1.0' },
  town: { name: 'Kenney Fantasy Town Kit 2.0', sourcePage: 'https://kenney.nl/assets/fantasy-town-kit', license: 'CC0-1.0' },
  suburban: { name: 'Kenney City Kit (Suburban) 2.0', sourcePage: 'https://kenney.nl/assets/city-kit-suburban', license: 'CC0-1.0' },
};

// 앱 의미 이름 → 실제 파일 클립명. 파일에 없는 클립은 null (절차적 대체 사용).
const CLIP_MAP = { idle: 'idle', walk: 'walk', run: 'sprint', work: 'interact-right', attack: 'holding-right-shoot', hit: null };
// 실제 장면에서 측정한 값 (scripts 의 측정 결과를 반영; 아래 주석 참조)
const CHARACTER_TUNING = { modelScale: 1.45, forwardYawOffset: 0, footOffset: 0 };

export function readGlbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const entries = [];
for (const pack of Object.keys(PACKS)) {
  for (const f of readdirSync(join(ROOT, pack)).filter((x) => x.endsWith('.glb')).sort()) {
    const buf = readFileSync(join(ROOT, pack, f));
    const j = readGlbJson(buf);
    const clips = (j.animations ?? []).map((a) => a.name);
    const images = (j.images ?? []).map((i) => i.uri ?? '(embedded)');
    const id = `${pack}/${f.replace(/\.glb$/, '')}`;
    const e = {
      id, localPath: `/assets/${pack}/${f}`, sourcePage: PACKS[pack].sourcePage, license: PACKS[pack].license,
      sha256: createHash('sha256').update(buf).digest('hex'), modified: false, externalTextures: images,
      skins: (j.skins ?? []).length, availableClips: clips,
    };
    if (pack === 'characters') {
      e.clips = Object.fromEntries(Object.entries(CLIP_MAP).map(([k, v]) => [k, v && clips.includes(v) ? v : null]));
      Object.assign(e, CHARACTER_TUNING);
    }
    entries.push(e);
  }
  const tex = readFileSync(join(ROOT, pack, 'Textures', 'colormap.png'));
  entries.push({ id: `${pack}/Textures/colormap`, localPath: `/assets/${pack}/Textures/colormap.png`, sourcePage: PACKS[pack].sourcePage, license: PACKS[pack].license, sha256: createHash('sha256').update(tex).digest('hex'), modified: false });
}
const manifest = { generatedBy: 'scripts/build-asset-manifest.mjs', packs: PACKS, assets: entries };
writeFileSync(join(ROOT, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`asset-manifest.json: ${entries.length} entries`);
