import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Settings {
  // Ses / Görüntü
  microphoneId: string;
  speakerId: string;
  pushToTalk: boolean;
  noiseSuppression: boolean;
  
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
  noiseSuppression: true,
  
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

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
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
