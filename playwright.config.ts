import { defineConfig } from '@playwright/test';

// 헤드리스 Chromium + SwiftShader(소프트웨어 WebGL2). 여기서 나온 FPS 는 기능 검사용이며 사용자 PC 성능이 아님 (설계문서 10.1)
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'npm run dev:showcase', url: 'http://127.0.0.1:5173/showcase', reuseExistingServer: true, timeout: 60_000 },
});
