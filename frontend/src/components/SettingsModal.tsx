import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Bell, Monitor, CheckCircle2, Info } from 'lucide-react';
import { useSettings, THEMES, ACCENTS } from '../contexts/SettingsContext';
import { createNoiseGate, type NoiseGate } from '../utils/noiseGate';
import KeybindInput from './KeybindInput';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showLastSeen?: boolean;
  onUpdatePrivacy?: (showLastSeen: boolean) => void;
}

type TabType = 'audio' | 'notifications' | 'ui' | 'privacy';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, showLastSeen = true, onUpdatePrivacy }) => {
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('audio');
  
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  // Eşik kaydırıcısının yanındaki canlı seviye çubuğu. Bu geri bildirim olmadan
  // kullanıcı eşiği doğru ayarlayamaz — nereye çektiğini göremez.
  const [micLevel, setMicLevel] = useState(0);
  const previewRef = useRef<{ raw: MediaStream; gate: NoiseGate } | null>(null);

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

  // Ses sekmesi açıkken geçici bir mikrofon önizlemesi tut: yalnızca seviye
  // ölçmek için. Sekme kapanınca stream durdurulur, mikrofon ışığı söner.
  useEffect(() => {
    if (!isOpen || activeTab !== 'audio' || !permissionGranted) return;

    let cancelled = false;
    let rafId = 0;

    (async () => {
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: settings.microphoneId && settings.microphoneId !== 'default'
            ? { deviceId: { exact: settings.microphoneId } }
            : true,
        });
        if (cancelled) { raw.getTracks().forEach(t => t.stop()); return; }

        // enabled: false — burada kapi kapatmiyoruz, yalnizca seviye okuyoruz.
        const gate = createNoiseGate(raw, { threshold: 0, enabled: false });
        previewRef.current = { raw, gate };

        const loop = () => {
          setMicLevel(gate.getLevel());
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        console.error('[Ayarlar] Mikrofon önizlemesi açılamadı:', e);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      previewRef.current?.gate.destroy();
      previewRef.current?.raw.getTracks().forEach(t => t.stop());
      previewRef.current = null;
      setMicLevel(0);
    };
    // Esik bilerek bagimlilik degil: kaydirici her oynadiginda mikrofonun
    // yeniden acilmasi gerekmez, cubuk yalnizca giris seviyesini gosterir.
  }, [isOpen, activeTab, permissionGranted, settings.microphoneId]);

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
          className="absolute inset-0 bg-black/80"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: settings.reducedMotion ? 1 : 0.95, y: settings.reducedMotion ? 0 : 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: settings.reducedMotion ? 1 : 0.95, y: settings.reducedMotion ? 0 : 20 }}
          transition={{ duration: settings.reducedMotion ? 0 : 0.3 }}
          className={`relative w-full max-w-2xl bg-bg-surface border border-border-main rounded-2xl overflow-hidden flex flex-col md:flex-row h-[80vh] md:h-[600px] ${settings.reducedMotion ? 'shadow-none' : 'shadow-2xl'}`}
        >
          {/* Sidebar — masaüstünde dikey kolon, mobilde yatay kaydırılabilir sekme şeridi */}
          <div className="w-full md:w-64 bg-bg-base/50 border-b md:border-b-0 md:border-r border-border-main p-3 md:p-4 flex flex-row md:flex-col gap-2 shrink-0 overflow-x-auto md:overflow-x-visible scrollbar-hide">
            <h2 className="hidden md:block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 px-2">Ayarlar</h2>

            <button
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm shrink-0 whitespace-nowrap ${
                activeTab === 'audio'
                  ? 'bg-primary-main/20 text-text-main border border-primary-main/30'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-subtle border border-transparent'
              }`}
            >
              <Mic size={18} className={activeTab === 'audio' ? 'text-primary-main' : ''} />
              Ses ve Görüntü
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm shrink-0 whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'bg-primary-main/20 text-text-main border border-primary-main/30'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-subtle border border-transparent'
              }`}
            >
              <Bell size={18} className={activeTab === 'notifications' ? 'text-primary-main' : ''} />
              Bildirimler
            </button>

            <button
              onClick={() => setActiveTab('ui')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm shrink-0 whitespace-nowrap ${
                activeTab === 'ui'
                  ? 'bg-primary-main/20 text-text-main border border-primary-main/30'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-subtle border border-transparent'
              }`}
            >
              <Monitor size={18} className={activeTab === 'ui' ? 'text-primary-main' : ''} />
              Görünüm
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm shrink-0 whitespace-nowrap ${
                activeTab === 'privacy'
                  ? 'bg-primary-main/20 text-text-main border border-primary-main/30'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-subtle border border-transparent'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={activeTab === 'privacy' ? 'text-primary-main' : ''}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Gizlilik
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
                {activeTab === 'audio' && <><Mic size={24} className="text-primary-main"/> Ses ve Görüntü Ayarları</>}
                {activeTab === 'notifications' && <><Bell size={24} className="text-primary-main"/> Bildirim Ayarları</>}
                {activeTab === 'ui' && <><Monitor size={24} className="text-primary-main"/> Görünüm Ayarları</>}
                {activeTab === 'privacy' && <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-main"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Gizlilik Ayarları</>}
              </h3>
              <button 
                onClick={onClose}
                className="p-2 text-text-muted hover:text-text-main bg-surface-subtle rounded-full transition-colors md:hidden"
              >
                <X size={20} />
              </button>
            </div>

            {/* Audio Tab */}
            {activeTab === 'audio' && (
              <div className="space-y-6">
                {!permissionGranted && (
                  <div className="bg-primary-main/10 border border-primary-main/30 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-sm text-text-main">Mikrofon cihazlarınızı görebilmek için tarayıcı iznine ihtiyacımız var.</p>
                    <button 
                      onClick={requestAudioPermission}
                      className="bg-primary-main text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors self-start"
                    >
                      İzin Ver
                    </button>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Giriş Cihazı (Mikrofon)</label>
                    <select 
                      value={settings.microphoneId}
                      onChange={(e) => updateSettings({ microphoneId: e.target.value })}
                      className="w-full bg-bg-base border border-border-main rounded-xl px-4 py-3 text-text-main focus:outline-none focus:border-primary-main transition-colors appearance-none"
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
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Çıkış Cihazı (Hoparlör)</label>
                    <select 
                      value={settings.speakerId}
                      onChange={(e) => updateSettings({ speakerId: e.target.value })}
                      className="w-full bg-bg-base border border-border-main rounded-xl px-4 py-3 text-text-main focus:outline-none focus:border-primary-main transition-colors appearance-none"
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

                <div className="h-px w-full bg-surface-subtle-strong my-6" />

                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                    <div className="flex flex-col">
                      <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Bas Konuş (Push to Talk)</span>
                      <span className="text-xs text-text-muted mt-1">Sadece belirlediğiniz tuşa basılı tuttuğunuzda sesiniz gider.</span>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={settings.pushToTalk}
                        onChange={(e) => updateSettings({ pushToTalk: e.target.checked })}
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${settings.pushToTalk ? 'bg-primary-main' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.pushToTalk ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                  </label>

                  {/* Tuş Atama */}
                  <div className="rounded-xl border border-border-main bg-surface-subtle divide-y divide-white/5">
                    <AnimatePresence initial={false}>
                      {settings.pushToTalk && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center justify-between p-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-main">Konuşma Tuşu</span>
                              <span className="text-xs text-text-muted mt-1">Bas-konuş için basılı tutulacak tuş.</span>
                            </div>
                            <KeybindInput
                              value={settings.pttKey}
                              onChange={(code) => updateSettings({ pttKey: code, ...(code && code === settings.muteToggleKey ? { muteToggleKey: '' } : {}) })}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-main">Mikrofon Aç/Kapat Kısayolu</span>
                        <span className="text-xs text-text-muted mt-1">Tek basışla mikrofonu susturur/açar.</span>
                      </div>
                      <KeybindInput
                        value={settings.muteToggleKey}
                        onChange={(code) => updateSettings({ muteToggleKey: code, ...(code && code === settings.pttKey ? { pttKey: '' } : {}) })}
                      />
                    </div>

                    <div className="flex items-start gap-2 p-3 text-[11px] text-text-muted">
                      <Info size={13} className="mt-0.5 shrink-0" />
                      <span>Kısayollar yalnızca tarayıcı sekmesi odaktayken çalışır. Atarken <b>Esc</b> iptal eder, <b>Backspace</b> temizler.</span>
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                    <div className="flex flex-col">
                      <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Yankı ve Gürültü Filtresi</span>
                      <span className="text-xs text-text-muted mt-1">Tarayıcının kendi filtresi: yankı engelleme, fan/uğultu azaltma ve otomatik ses seviyesi. Kapatırsan hoparlör kullananlar yankı duyar.</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={settings.noiseSuppression}
                        onChange={(e) => updateSettings({ noiseSuppression: e.target.checked })}
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${settings.noiseSuppression ? 'bg-primary-main' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseSuppression ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                  </label>

                  {/* Gürültü kapısı — eşik altındaki sesi tamamen keser */}
                  <div className="rounded-xl border border-border-main bg-surface-subtle">
                    <label className="flex items-center justify-between p-4 cursor-pointer group">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Giriş Hassasiyeti (Gürültü Kapısı)</span>
                        <span className="text-xs text-text-muted mt-1">Sesin eşiği geçmedikçe mikrofonun kapalı kalır. Klavye, TV ve arka plan konuşmalarını keser.</span>
                      </div>
                      <div className="relative shrink-0 ml-4">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={settings.noiseGateEnabled}
                          onChange={(e) => updateSettings({ noiseGateEnabled: e.target.checked })}
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${settings.noiseGateEnabled ? 'bg-primary-main' : 'bg-gray-600'}`}>
                          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseGateEnabled ? 'translate-x-4' : ''}`} />
                        </div>
                      </div>
                    </label>

                    <AnimatePresence initial={false}>
                      {settings.noiseGateEnabled && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-border-main"
                        >
                          <div className="p-4 space-y-3">
                            {/* Canlı seviye çubuğu — eşik çizgisi üstünde */}
                            <div className="relative h-2.5 w-full rounded-full bg-black/40 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-[width] duration-75 ${micLevel >= settings.noiseGateThreshold ? 'bg-emerald-400' : 'bg-surface-subtle-strong'}`}
                                style={{ width: `${micLevel}%` }}
                              />
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-primary-main"
                                style={{ left: `${settings.noiseGateThreshold}%` }}
                              />
                            </div>

                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={settings.noiseGateThreshold}
                              onChange={(e) => updateSettings({ noiseGateThreshold: Number(e.target.value) })}
                              className="w-full h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-primary-main"
                            />

                            <div className="flex items-start gap-2 text-[11px] text-text-muted">
                              <Info size={13} className="mt-0.5 shrink-0" />
                              <span>
                                {permissionGranted
                                  ? <>Konuşurken çubuk <b className="text-emerald-400">yeşile</b> dönmeli, sessizken mor çizginin solunda kalmalı. Sesin kesiliyorsa eşiği azalt.</>
                                  : <>Çubuğu görmek için yukarıdan mikrofon izni ver.</>}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Uygulama İçi Sesler</span>
                    <span className="text-xs text-text-muted mt-1">Mesaj geldiğinde, odaya girildiğinde çalan ses efektleri.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.notificationSoundEnabled}
                      onChange={(e) => updateSettings({ notificationSoundEnabled: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.notificationSoundEnabled ? 'bg-primary-main' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.notificationSoundEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>

                {settings.notificationSoundEnabled && (
                  <div className="pl-4 border-l-2 border-primary-main/30 ml-2 mt-2">
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Bildirim Sesi Melodisi</label>
                    <select 
                      value={settings.notificationTone}
                      onChange={(e) => updateSettings({ notificationTone: e.target.value })}
                      className="w-full bg-bg-base border border-border-main rounded-xl px-4 py-3 text-text-main focus:outline-none focus:border-primary-main transition-colors appearance-none"
                    >
                      <option value="default">Klasik Ding</option>
                      <option value="pop">Hafif Pop</option>
                      <option value="retro">Retro</option>
                      <option value="chime">Zil (Chime)</option>
                    </select>
                  </div>
                )}

                <div className="h-px w-full bg-surface-subtle-strong my-4" />

                <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Özel Mesaj Bildirimleri</span>
                    <span className="text-xs text-text-muted mt-1">Biri size DM attığında görsel uyarı ve kırmızı rozet göster.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.dmNotificationsEnabled}
                      onChange={(e) => updateSettings({ dmNotificationsEnabled: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.dmNotificationsEnabled ? 'bg-primary-main' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.dmNotificationsEnabled ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>

                <div className="p-4 rounded-xl border border-border-main bg-surface-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main">Masaüstü Bildirimleri (Push Notification)</span>
                    <span className="text-xs text-text-muted mt-1">Tarayıcı arkada açıkken bile mesaj bildirimlerini bilgisayara yolla.</span>
                  </div>
                  {settings.pushNotificationsEnabled ? (
                    <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg text-sm shrink-0 font-medium">
                      <CheckCircle2 size={16} /> Açık
                    </div>
                  ) : (
                    <button 
                      onClick={handleRequestPushPermission}
                      className="bg-primary-main hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
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
                <div className="p-4 rounded-xl border border-border-main bg-surface-subtle">
                  <div className="flex flex-col mb-3">
                    <span className="font-semibold text-text-main">Tema</span>
                    <span className="text-xs text-text-muted mt-1">Seçimin bu tarayıcıda kayıtlı kalır. "Sistem", cihazının açık/koyu tercihini takip eder.</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
                          settings.theme === t.id
                            ? 'bg-primary-main text-white border-primary-main'
                            : 'text-text-muted border-border-main hover:text-text-main hover:bg-surface-subtle-strong'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border-main bg-surface-subtle">
                  <div className="flex flex-col mb-3">
                    <span className="font-semibold text-text-main">Vurgu Rengi</span>
                    <span className="text-xs text-text-muted mt-1">Butonlar, bağlantılar ve seçili öğeler bu rengi kullanır. Temadan bağımsız çalışır.</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {ACCENTS.map(a => (
                      <button
                        key={a.id}
                        onClick={() => updateSettings({ accent: a.id })}
                        title={a.label}
                        aria-label={a.label}
                        aria-pressed={settings.accent === a.id}
                        className={`w-9 h-9 rounded-full transition-transform cursor-pointer ring-offset-2 ring-offset-bg-surface ${
                          settings.accent === a.id ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: a.swatch }}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Animasyonları Azalt (Reduced Motion)</span>
                    <span className="text-xs text-text-muted mt-1">Uygulama içindeki menü kaymaları, buton efektleri ve arka plan ışıklarını kapatarak performansı artırır.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.reducedMotion}
                      onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.reducedMotion ? 'bg-primary-main' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.reducedMotion ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>

                <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Cam Efekti (Blur)</span>
                    <span className="text-xs text-text-muted mt-1">Panellerin arkasını bulanıklaştırır. Şık ama pahalı — arayüz takılıyorsa ilk bunu kapat.</span>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={settings.glassEffect}
                      onChange={(e) => updateSettings({ glassEffect: e.target.checked })}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${settings.glassEffect ? 'bg-primary-main' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.glassEffect ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Privacy Tab */}
            {activeTab === 'privacy' && (
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 rounded-xl border border-border-main bg-surface-subtle hover:bg-surface-subtle-strong transition-colors cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-main group-hover:text-primary-main transition-colors">Son Görülmeyi Göster</span>
                    <span className="text-xs text-text-muted mt-1">Kapatırsanız, kimse son görülmenizi göremez. Fakat siz de başkalarının son görülmesini göremezsiniz.</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={showLastSeen !== false}
                      onChange={(e) => onUpdatePrivacy?.(e.target.checked)}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${showLastSeen !== false ? 'bg-primary-main' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${showLastSeen !== false ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>
              </div>
            )}
            
          </div>
          
          {/* Close button for Desktop - absolutely positioned inside the modal */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-main bg-surface-subtle hover:bg-surface-subtle-strong rounded-full transition-colors hidden md:block"
          >
            <X size={20} />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SettingsModal;
