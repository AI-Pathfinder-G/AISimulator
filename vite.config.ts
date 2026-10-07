import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 포트가 조용히 바뀌지 않도록 strictPort (설계문서 13.4)
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 6000 },
});
