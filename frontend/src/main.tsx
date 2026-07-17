import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './contexts/SettingsContext'
import ErrorBoundary from './components/ErrorBoundary'
import MotionRoot from './components/MotionRoot'

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
