import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';
import { spring } from '../utils/motion';

// "Animasyonlari Azalt" acikken framer-motion'in transform/layout
// animasyonlarini tek yerden kapatir (opacity gecisleri kalir — icerik
// aniden belirip kaybolmasin). CSS tarafindaki karsiligi index.css'teki
// html.reduce-motion kurali.
// transition: kendi gecisini belirtmeyen her motion bileseni ortak yayi
// kullanir — uygulama genelinde ayni his.
export default function MotionRoot({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'} transition={spring.smooth}>
      {children}
    </MotionConfig>
  );
}
