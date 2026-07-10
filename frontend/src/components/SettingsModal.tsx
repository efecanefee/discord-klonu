import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Bell, Monitor, CheckCircle2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'audio' | 'notifications' | 'ui';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('audio');
  
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && activeTab === 'audio') {
      const fetchDevices = async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter(d => d.kind === 'audioinput');
          const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
          
          if (audioInputs.some(d => d.label)) {
            setPermissionGranted(true);
          }
          
          setMicrophones(audioInputs);
          setSpeakers(audioOutputs);
        } catch (err) {
          console.error("Error fetching devices", err);
        }
      };
      
      fetchDevices();
    }
  }, [isOpen, activeTab]);

  const requestAudioPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Permission granted, stop track
      setPermissionGranted(true);
      // Re-fetch devices now that we have permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter(d => d.kind === 'audioinput'));
      setSpeakers(devices.filter(d => d.kind === 'audiooutput'));
    } catch (err) {
      console.error("Permission denied", err);
    }
  };

  const handleRequestPushPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        updateSettings({ pushNotificationsEnabled: true });
      } else {
        updateSettings({ pushNotificationsEnabled: false });
        alert('Bildirim izni reddedildi.');
      }
    } else {
      alert('Tarayıcınız masaüstü bildirimlerini desteklemiyor.');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`absolute inset-0 ${settings.reducedMotion ? 'bg-black/80' : 'bg-black/60 backdrop-blur-sm'}`}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: settings.reducedMotion ? 1 : 0.95, y: settings.reducedMotion ? 0 : 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: settings.reducedMotion ? 1 : 0.95, y: settings.reducedMotion ? 0 : 20 }}
          transition={{ duration: settings.reducedMotion ? 0 : 0.3 }}
          className={`relative w-full max-w-2xl bg-[#0F172A] border border-white/10 rounded-2xl overflow-hidden flex flex-col md:flex-row h-[80vh] md:h-[600px] ${settings.reducedMotion ? 'shadow-none' : 'shadow-2xl'}`}
        >
          {/* Sidebar */}
          <div className="w-full md:w-64 bg-[#1E293B]/50 border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2 px-2">Ayarlar</h2>
            
            <button
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm ${
                activeTab === 'audio' 
                  ? 'bg-[#7C3AED]/20 text-white border border-[#7C3AED]/30' 
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Mic size={18} className={activeTab === 'audio' ? 'text-[#7C3AED]' : ''} />
              Ses ve Görüntü
            </button>
            
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm ${
                activeTab === 'notifications' 
                  ? 'bg-[#7C3AED]/20 text-white border border-[#7C3AED]/30' 
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Bell size={18} className={activeTab === 'notifications' ? 'text-[#7C3AED]' : ''} />
              Bildirimler
            </button>
            
            <button
              onClick={() => setActiveTab('ui')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm ${
                activeTab === 'ui' 
                  ? 'bg-[#7C3AED]/20 text-white border border-[#7C3AED]/30' 
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Monitor size={18} className={activeTab === 'ui' ? 'text-[#7C3AED]' : ''} />
              Görünüm
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                {activeTab === 'audio' && <><Mic size={24} className="text-[#7C3AED]"/> Ses ve Görüntü Ayarları</>}
                {activeTab === 'notifications' && <><Bell size={24} className="text-[#7C3AED]"/> Bildirim Ayarları</>}
                {activeTab === 'ui' && <><Monitor size={24} className="text-[#7C3AED]"/> Görünüm Ayarları</>}
              </h3>
              <button 
                onClick={onClose}
                className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full transition-colors md:hidden"
              >
                <X size={20} />
              </button>
            </div>

            {/* Audio Tab */}
            {activeTab === 'audio' && (
              <div className="space-y-6">
                {!permissionGranted && (
                  <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/30 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-sm text-white/80">Mikrofon cihazlarınızı görebilmek için tarayıcı iznine ihtiyacımız var.</p>
                    <button 
                      onClick={requestAudioPermission}
                      className="bg-[#7C3AED] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#6D28D9] transition-colors self-start"
                    >
                      İzin Ver
                    </button>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Giriş Cihazı (Mikrofon)</label>
                    <select 
                      value={settings.microphoneId}
                      onChange={(e) => updateSettings({ microphoneId: e.target.value })}
                      className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#7C3AED] transition-colors appearance-none"
                    >
                      <option value="default">Varsayılan Mikrofon</option>
                      {microphones.map(mic => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Mikrofon ${mic.deviceId.slice(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Çıkış Cihazı (Hoparlör)</label>
                    <select 
                      value={settings.speakerId}
                      onChange={(e) => updateSettings({ speakerId: e.target.value })}
                      className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#7C3AED] transition-colors appearance-none"
                    >
                      <option value="default">Varsayılan Hoparlör</option>
                      {speakers.map(speaker => (
                        <option key={speaker.deviceId} value={speaker.deviceId}>
                          {speaker.label || `Hoparlör ${speaker.deviceId.slice(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="h-px w-full bg-white/10 my-6" />

                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                    <div className="flex flex-col">
                      <span className="font-semibold text-white group-hover:text-[#7C3AED] transition-colors">Bas Konuş (Push to Talk)</span>
                      <span className="text-xs text-white/50 mt-1">Sadece belirlediğiniz tuşa basılı tuttuğunuzda sesiniz gider.</span>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={settings.pushToTalk}
                        onChange={(e) => updateSettings({ pushToTalk: e.target.checked })}
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${settings.pushToTalk ? 'bg-[#7C3AED]' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.pushToTalk ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                    <div className="flex flex-col">
                      <span className="font-semibold text-white group-hover:text-[#7C3AED] transition-colors">Gürültü Engelleme (Noise Suppression)</span>
                      <span className="text-xs text-white/50 mt-1">Arka plandaki klavye, fan gibi rahatsız edici sesleri filtreler.</span>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={settings.noiseSuppression}
                        onChange={(e) => updateSettings({ noiseSuppression: e.target.checked })}
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${settings.noiseSuppression ? 'bg-[#7C3AED]' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseSuppression ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-white group-hover:text-[#7C3AED] transition-colors">Uygulama İçi Sesler</span>
                    <span className="text-xs text-white/50 mt-1">Mesaj geldiğinde, odaya girildiğinde çalan ses efektleri.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.notificationSoundEnabled}
                      onChange={(e) => updateSettings({ notificationSoundEnabled: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.notificationSoundEnabled ? 'bg-[#7C3AED]' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.notificationSoundEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>

                {settings.notificationSoundEnabled && (
                  <div className="pl-4 border-l-2 border-[#7C3AED]/30 ml-2 mt-2">
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Bildirim Sesi Melodisi</label>
                    <select 
                      value={settings.notificationTone}
                      onChange={(e) => updateSettings({ notificationTone: e.target.value })}
                      className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#7C3AED] transition-colors appearance-none"
                    >
                      <option value="default">Klasik Ding</option>
                      <option value="pop">Hafif Pop</option>
                      <option value="retro">Retro</option>
                      <option value="chime">Zil (Chime)</option>
                    </select>
                  </div>
                )}

                <div className="h-px w-full bg-white/10 my-4" />

                <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-white group-hover:text-[#7C3AED] transition-colors">Özel Mesaj Bildirimleri</span>
                    <span className="text-xs text-white/50 mt-1">Biri size DM attığında görsel uyarı ve kırmızı rozet göster.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.dmNotificationsEnabled}
                      onChange={(e) => updateSettings({ dmNotificationsEnabled: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.dmNotificationsEnabled ? 'bg-[#7C3AED]' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.dmNotificationsEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>

                <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="font-semibold text-white">Masaüstü Bildirimleri (Push Notification)</span>
                    <span className="text-xs text-white/50 mt-1">Tarayıcı arkada açıkken bile mesaj bildirimlerini bilgisayara yolla.</span>
                  </div>
                  {settings.pushNotificationsEnabled ? (
                    <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg text-sm shrink-0 font-medium">
                      <CheckCircle2 size={16} /> Açık
                    </div>
                  ) : (
                    <button 
                      onClick={handleRequestPushPermission}
                      className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
                    >
                      İzin İste
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* UI Tab */}
            {activeTab === 'ui' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-white group-hover:text-[#7C3AED] transition-colors">Animasyonları Azalt (Reduced Motion)</span>
                    <span className="text-xs text-white/50 mt-1">Uygulama içindeki menü kaymaları, buton efektleri ve arka plan ışıklarını kapatarak performansı artırır.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.reducedMotion}
                      onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.reducedMotion ? 'bg-[#7C3AED]' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.reducedMotion ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>
              </div>
            )}
            
          </div>
          
          {/* Close button for Desktop - absolutely positioned inside the modal */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors hidden md:block"
          >
            <X size={20} />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SettingsModal;
