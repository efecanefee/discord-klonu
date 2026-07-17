import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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
  reducedMotion: boolean;
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
  
  reducedMotion: true,
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
