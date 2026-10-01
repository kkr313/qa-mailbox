import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `vercel dev` / `netlify dev` serve the functions themselves. When running plain
// `vite`, point API_PROXY at whichever local functions server you started.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 2113,
      proxy: {
        '/api': env.API_PROXY || 'http://localhost:4213',
      },
    },
  };
});
