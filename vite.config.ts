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
    setupFiles: ['./src/testSetup.ts']
  }
});
