import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Theme = 'system' | 'dark' | 'light' | 'oled';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Sistem' },
  { id: 'dark', label: 'Koyu' },
  { id: 'light', label: 'Açık' },
  { id: 'oled', label: 'OLED' },
];

export interface Settings {
  // Ses / Görüntü
  microphoneId: string;
  speakerId: string;
  pushToTalk: boolean;
  pttKey: string;          // Bas-konuş tuşu (KeyboardEvent.code)
  muteToggleKey: string;   // Mikrofon aç/kapat kısayolu (KeyboardEvent.code)
  noiseSuppression: boolean;   // Tarayıcının kendi filtresi — durağan gürültü için
  noiseGateEnabled: boolean;   // Gürültü kapısı — eşik altındaki sesi tamamen keser
  noiseGateThreshold: number;  // 0-100
  
  // Bildirimler
  notificationSoundEnabled: boolean;
  notificationTone: string;
  dmNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  
  // Görünüm / UI
  theme: Theme;
  reducedMotion: boolean;
  glassEffect: boolean;  // Panellerdeki backdrop-blur. Pahalı — zayıf cihazlarda kapatılabilir.
}

const defaultSettings: Settings = {
  microphoneId: 'default',
  speakerId: 'default',
  pushToTalk: false,
  pttKey: 'Space',
  muteToggleKey: 'PageUp',
  noiseSuppression: true,
  noiseGateEnabled: true,
  noiseGateThreshold: 15,
  
  notificationSoundEnabled: true,
  notificationTone: 'default',
  dmNotificationsEnabled: true,
  pushNotificationsEnabled: false,
  
  theme: 'dark',
  reducedMotion: true,
  glassEffect: true,   // Varsayılan açık — mevcut görünüm korunsun.
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('sm_settings');
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Failed to parse settings from local storage', e);
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('sm_settings', JSON.stringify(settings));
  }, [settings]);

  // Tema: renk degerleri index.css'te, burasi yalnizca hangi sinifin gecerli
  // oldugunu soyler. 'system' secildiginde isletim sistemi tercihi dinlenir —
  // kullanici karanlik moda gecince uygulama yeniden yuklemeden takip eder.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');

    const apply = () => {
      const effective = settings.theme === 'system'
        ? (media.matches ? 'light' : 'dark')
        : settings.theme;
      root.classList.remove('theme-dark', 'theme-light', 'theme-oled');
      root.classList.add(`theme-${effective}`);
      // Tarayici kendi arayuzunu (kaydirma cubugu, form kontrolleri) buna gore boyar.
      root.style.colorScheme = effective === 'light' ? 'light' : 'dark';
    };

    apply();
    if (settings.theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // Saf CSS efektlerini <html> sinifi uzerinden kontrol et — React'in
  // reducedMotion kontrolleri stylesheet'teki animasyonlara ulasamiyor.
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  }, [settings.reducedMotion]);

  // Cam efekti bilerek reducedMotion'dan ayri: reducedMotion varsayilan acik
  // oldugu icin ona baglamak cam gorunumunu herkeste varsayilan olarak
  // kapatirdi.
  useEffect(() => {
    document.documentElement.classList.toggle('no-glass', !settings.glassEffect);
  }, [settings.glassEffect]);

  // Kimlik sabit kalmali: tuketiciler bunu useCallback/useEffect bagimliligi
  // olarak kullaniyor, her render'da degisirse gereksiz yeniden calisir.
  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
