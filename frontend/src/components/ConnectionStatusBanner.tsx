import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import signalrService, { type ConnectionStatus } from '../services/signalrService';
import { playConnectionLostSound, playConnectionRestoredSound } from '../utils/sound';

// Sunucu baglantisi koptugunda ekranin ustunde gorunen uyari. Odadaysa veya
// ses kanalindaysa sesli de uyarir — onceden baglanti sessizce kopuyor,
// kullanici kimseyi duymadigini fark etmiyordu.
const ConnectionStatusBanner: React.FC = () => {
  const [showRestored, setShowRestored] = useState(false);
  const [lost, setLost] = useState(false);
  // Ilk baglanti kurulmadan (login ekrani, backend uyaniyor) uyari gosterme
  const everConnectedRef = useRef(signalrService.connectionStatus === 'connected');
  const lostRef = useRef(false);

  useEffect(() => {
    let restoredTimer: ReturnType<typeof setTimeout> | null = null;
    const handle = (next: ConnectionStatus) => {
      if (next === 'connected') {
        if (lostRef.current) {
          lostRef.current = false;
          setLost(false);
          if (signalrService.isInCall) playConnectionRestoredSound();
          setShowRestored(true);
          if (restoredTimer) clearTimeout(restoredTimer);
          restoredTimer = setTimeout(() => setShowRestored(false), 3000);
        }
        everConnectedRef.current = true;
      } else if (everConnectedRef.current && !lostRef.current) {
        lostRef.current = true;
        setLost(true);
        setShowRestored(false);
        if (signalrService.isInCall) playConnectionLostSound();
      }
    };
    signalrService.onConnectionStatus(handle);
    return () => {
      signalrService.offConnectionStatus(handle);
      if (restoredTimer) clearTimeout(restoredTimer);
    };
  }, []);

  if (!lost && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border shadow-2xl max-w-[calc(100vw-32px)]"
      style={{
        background: 'var(--glass-solid-bg)',
        borderColor: lost ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)',
      }}
    >
      {lost ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0 text-red-400 animate-pulse" />
          <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-main)' }}>
            Bağlantı koptu — yeniden bağlanılıyor…
          </span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 shrink-0 text-green-400" />
          <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-main)' }}>
            Yeniden bağlandı
          </span>
        </>
      )}
    </div>
  );
};

export default ConnectionStatusBanner;
