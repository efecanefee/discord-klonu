import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './contexts/SettingsContext'
import ErrorBoundary from './components/ErrorBoundary'
import MotionRoot from './components/MotionRoot'
import { registerSW } from 'virtual:pwa-register'

// PWA güncelleme akışı: varsayılan kayıt betiği yeni sürümü fark etmiyordu —
// kullanıcılar Ctrl+Shift+R yapana dek eski önbellekte kalıyordu.
// - immediate: SW kaydı sayfa açılır açılmaz yapılır.
// - autoUpdate modunda yeni SW devreye girince sayfa otomatik yenilenir
//   (virtual modül controllerchange'te reload eder).
// - Ek olarak: sekme her öne gelişte ve saatte bir sunucudan yeni sürüm kontrolü.
registerSW({
  immediate: true,
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
