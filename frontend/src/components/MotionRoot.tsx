import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';

// "Animasyonlari Azalt" acikken framer-motion'in transform/layout
// animasyonlarini tek yerden kapatir (opacity gecisleri kalir — icerik
// aniden belirip kaybolmasin). CSS tarafindaki karsiligi index.css'teki
// html.reduce-motion kurali.
export default function MotionRoot({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  );
}
