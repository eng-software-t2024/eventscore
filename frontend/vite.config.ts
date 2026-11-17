import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:13000';
  const authTarget = env.VITE_DEV_SUPABASE_TARGET;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        ...(authTarget
          ? {
              '/supabase-auth': {
                target: authTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/supabase-auth/, '/auth/v1'),
              },
            }
          : {}),
      },
    },
  };
});
