import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './contexts/SettingsContext'
import ErrorBoundary from './components/ErrorBoundary'
import MotionRoot from './components/MotionRoot'
import { registerSW } from 'virtual:pwa-register'
import { setUpdateReady } from './utils/swUpdate'

// PWA güncelleme akışı ("hazır olunca yenile"):
// - immediate: SW kaydı sayfa açılır açılmaz yapılır.
// - Sekme öne gelince + saatte bir sunucudan yeni sürüm kontrol edilir.
// - Yeni sürüm İNDİRİLİR ama hemen uygulanmaz (prompt modu) — App, kullanıcı
//   güvenli bir yerdeyken (oda/DM/ses yokken) otomatik uygular; odadaysa
//   "Yeni sürüm hazır" bildirimi gösterir. Böylece mesaj yazarken/sesli
//   sohbetteyken sayfa aniden yenilenmez.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    setUpdateReady(() => updateSW(true))
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => { /* çevrimdışı olabilir */ })
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <MotionRoot>
          <App />
        </MotionRoot>
      </SettingsProvider>
    </ErrorBoundary>
  </StrictMode>,
)
