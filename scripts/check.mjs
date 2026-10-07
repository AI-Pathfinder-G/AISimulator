// npm run check: 타입 검사 + 현재 단계 단위 테스트 + 빌드 (Windows/Unix 공통 Node 스크립트)
import { spawnSync } from 'node:child_process';
const steps = [['타입 검사', 'npx', ['tsc', '-b']], ['린트', 'npx', ['oxlint']], ['단위 테스트', 'npx', ['vitest', 'run']], ['빌드', 'npx', ['vite', 'build']]];
for (const [name, cmd, args] of steps) {
  console.log(`\n== ${name}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`✗ ${name} 실패 (exit ${r.status})`); process.exit(r.status ?? 1); }
}
console.log('\n✓ check 통과');
