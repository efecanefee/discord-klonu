import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Acik tema kaldirildi: uygulamanin yuzeyleri koyu zemine gore tasarlanmis,
// acikta yikanmis gri bir goruntu cikiyordu. "Sistem" de onunla birlikte
// gitti — prefers-color-scheme acik/koyu arasinda secer, acik yokken takip
// edecek bir sey kalmiyor.
export type Theme = 'dark' | 'oled';

// Zemin koyulugu: temadan bagimsiz. OLED secilince zemin saf siyah olur,
// temanin vurgu ve sistem renkleri korunur.
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Tema zemini' },
  { id: 'oled', label: 'OLED siyah' },
];

export type Accent =
  | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan'
  | 'ocean' | 'sunsetpurple' | 'pastelblue' | 'milano' | 'palesun';

// Her tema tum arayuzu boyar (zemin, yuzey, metin, vurgu, soundboard...).
// Gercek degerler index.css'te; buradakiler yalnizca ayarlardaki onizleme
// karti icin: swatch ana renk, swatch2 ikinci renk, bg/card temanin zemini.
export const ACCENTS: { id: Accent; label: string; swatch: string; swatch2: string; bg: string; card: string }[] = [
  { id: 'blue', label: 'Gece Mavisi', swatch: '#2563eb', swatch2: '#3b82f6', bg: '#0a0b11', card: '#181b27' },
  { id: 'violet', label: 'Ametist', swatch: '#7c3aed', swatch2: '#a78bfa', bg: '#0c0a13', card: '#1b1728' },
  { id: 'emerald', label: 'Orman', swatch: '#059669', swatch2: '#10b981', bg: '#070f0b', card: '#121f19' },
  { id: 'amber', label: 'Kehribar', swatch: '#d97706', swatch2: '#f59e0b', bg: '#100b06', card: '#211910' },
  { id: 'rose', label: 'Yakut', swatch: '#e11d48', swatch2: '#f43f5e', bg: '#110709', card: '#231218' },
  { id: 'cyan', label: 'Buzul', swatch: '#0891b2', swatch2: '#06b6d4', bg: '#051013', card: '#0f1f24' },
  { id: 'ocean', label: 'Okyanus', swatch: '#0E9AA7', swatch2: '#2B8CF0', bg: '#03101a', card: '#0c2130' },
  { id: 'sunsetpurple', label: 'Gün Batımı', swatch: '#F97316', swatch2: '#A855F7', bg: '#110912', card: '#231425' },
  { id: 'pastelblue', label: 'Pastel Gökyüzü', swatch: '#5FA8D3', swatch2: '#A7C7E7', bg: '#0d1119', card: '#1b2330' },
  { id: 'milano', label: 'Milano', swatch: '#C8102E', swatch2: '#FFF4C2', bg: '#0f0707', card: '#211110' },
  { id: 'palesun', label: 'Güneş & Lacivert', swatch: '#4F74C8', swatch2: '#FFE08A', bg: '#070b16', card: '#131b2e' },
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
  soundboardVolume: number;    // 0-1, ana ses seviyesiyle carpilir
  
  // Bildirimler
  notificationSoundEnabled: boolean;
  notificationTone: string;
  dmNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  
  // Görünüm / UI
  theme: Theme;
  accent: Accent;
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
  // Yuklenen sesler genelde yuksek kayitli; yarim seviye makul bir baslangic.
  soundboardVolume: 0.5,
  
  notificationSoundEnabled: true,
  notificationTone: 'default',
  dmNotificationsEnabled: true,
  pushNotificationsEnabled: false,
  
  theme: 'dark',
  // SM2.0: ana renk mavi.
  accent: 'blue',
  // SM2.0: animasyonlar varsayilan acik. Sistem "hareketi azalt" tercihi
  // MotionRoot ve CSS media query'leri uzerinden yine dikkate alinir.
  reducedMotion: false,
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
        const merged: Settings = { ...defaultSettings, ...JSON.parse(saved) };
        // Kaldirilan temalari ('light', 'system') secmis olanlar gecersiz bir
        // degerle kalmasin: hicbir theme-* sinifi eslesmezdi.
        if (!THEMES.some(t => t.id === merged.theme)) merged.theme = defaultSettings.theme;
        // Eski surumde reducedMotion varsayilan acikti; cogu kullanici bunu hic
        // secmedi. Yeni hareket dilini gorebilmeleri icin bir kerelik sifirla.
        if (!localStorage.getItem('sm_motion_v2')) {
          merged.reducedMotion = false;
          localStorage.setItem('sm_motion_v2', '1');
        }
        // Ana renk mordan maviye gecti. Eski varsayilan mor oldugu icin mor
        // kayitli olanlar bir kerelik maviye alinir; isteyen ayarlardan geri secer.
        if (!localStorage.getItem('sm_accent_blue')) {
          if (merged.accent === 'violet') merged.accent = 'blue';
          localStorage.setItem('sm_accent_blue', '1');
        }
        return merged;
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
  // oldugunu soyler.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-oled');
    root.classList.add(`theme-${settings.theme}`);
    // Tarayici kendi arayuzunu (kaydirma cubugu, form kontrolleri) buna gore boyar.
    root.style.colorScheme = 'dark';
  }, [settings.theme]);

  // Tema (data-accent) tum renkleri belirler; OLED yalnizca zemini siyaha indirir.
  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
    // Mobil tarayici cubugu da temanin zeminine uysun
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [settings.accent, settings.theme]);

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
