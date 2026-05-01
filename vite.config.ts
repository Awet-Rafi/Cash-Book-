import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      manifest: {
        name: 'Mini ERP Store Manager',
        short_name: 'MiniERP',
        description: 'Modern store management platform',
        theme_color: '#4f46e5',
        icons: [
          {
            src: 'https://ais-pre-omxcj6dlpjhy27czddn4wf-83624937983.europe-west3.run.app/favicon.ico',
            sizes: '64x64',
            type: 'image/x-icon'
          },
          {
            src: 'https://ais-pre-omxcj6dlpjhy27czddn4wf-83624937983.europe-west3.run.app/favicon.ico',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://ais-pre-omxcj6dlpjhy27czddn4wf-83624937983.europe-west3.run.app/favicon.ico',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
