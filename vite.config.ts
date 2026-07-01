import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const base = process.env.VITE_BASE_PATH ?? '/';

const devPort = process.env.PORT ? Number(process.env.PORT) : 5173;

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: devPort, strictPort: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    // 테스트는 로컬 .env.local 의 번들 Supabase 설정과 무관하게 결정적으로 돌린다.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }
  }
});
