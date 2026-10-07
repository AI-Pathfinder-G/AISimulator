// npm run doctor: 실행 환경·의존성·에셋 체크섬 점검 (Node 기반, OS 무관)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const [maj] = process.versions.node.split('.').map(Number);
ok(maj >= 20, `Node ${process.versions.node} (>= 20 필요)`);
for (const d of ['@babylonjs/core', '@babylonjs/loaders', 'react', 'vite', 'vitest', '@playwright/test']) ok(existsSync(`${root}/node_modules/${d}/package.json`), `의존성 ${d}`);
const core = JSON.parse(readFileSync(`${root}/node_modules/@babylonjs/core/package.json`, 'utf8')).version;
const loaders = JSON.parse(readFileSync(`${root}/node_modules/@babylonjs/loaders/package.json`, 'utf8')).version;
ok(core === loaders, `Babylon core ${core} / loaders ${loaders} 버전 일치`);
const man = JSON.parse(readFileSync(`${root}/public/assets/asset-manifest.json`, 'utf8'));
let mism = 0;
for (const a of man.assets) {
  const p = `${root}/public${a.localPath}`;
  if (!existsSync(p) || createHash('sha256').update(readFileSync(p)).digest('hex') !== a.sha256) { mism++; console.log(`  체크섬 불일치/누락: ${a.localPath}`); }
}
ok(mism === 0, `에셋 ${man.assets.length}개 체크섬 확인`);
await new Promise((res) => { const s = createServer(); s.once('error', () => { console.log('! 포트 5173 사용 중 (이미 dev 서버가 떠 있을 수 있음, 무관한 프로세스는 종료하지 않음)'); res(); }); s.listen(5173, '127.0.0.1', () => { s.close(); console.log('✓ 포트 5173 사용 가능'); res(); }); });
console.log(bad ? `\n문제 ${bad}건` : '\n환경 정상');
process.exit(bad ? 1 : 0);
