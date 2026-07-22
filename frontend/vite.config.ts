import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // prompt: yeni SW indirilir ama bekletilir; main.tsx "hazır olunca"
      // updateSW(true) ile devreye alır (skipWaiting mesajı + otomatik reload).
      registerType: 'prompt',
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'SandalyeciMetin',
        short_name: 'Sandalyeci',
        description: 'Gerçek zamanlı sesli, görüntülü ve yazılı sohbet uygulaması',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
})
