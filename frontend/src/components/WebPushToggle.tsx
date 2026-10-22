import React, { useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { getPushState, enableWebPush, disableWebPush, type PushState } from '../utils/webPush';

const HINT: Record<PushState, string> = {
  unsupported: 'Bu tarayıcı push bildirimlerini desteklemiyor. iPhone’da önce siteyi Ana Ekrana ekle.',
  'server-disabled': 'Sunucuda push bildirimleri henüz açılmadı.',
  denied: 'Bildirim izni engellenmiş. Tarayıcı ayarlarından bu site için izin ver.',
  off: 'Uygulama kapalıyken de özel mesaj ve @bahsetme bildirimi al.',
  on: 'Açık: uygulama kapalıyken de özel mesaj ve @bahsetme bildirimleri gelir.',
};

// Ayarlar > Bildirimler: gerçek Web Push aboneliği (sekme kapalıyken de çalışır)
const WebPushToggle: React.FC = () => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState().then(s => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    if (busy || !state) return;
    setBusy(true);
    try {
      if (state === 'on') {
        await disableWebPush();
        setState('off');
      } else {
        setState(await enableWebPush());
      }
    } catch {
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  const on = state === 'on';
  const usable = state === 'on' || state === 'off';

  return (
    <div className="p-4 rounded-xl border border-border-main bg-surface-subtle flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <BellRing size={18} className={`mt-0.5 shrink-0 ${on ? 'text-primary-main' : 'text-text-muted'}`} />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-text-main">Telefona / Masaüstüne Push Bildirim</span>
          <span className="text-xs text-text-muted mt-1">{state ? HINT[state] : 'Kontrol ediliyor...'}</span>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Push bildirimleri"
        disabled={!usable || busy}
        onClick={toggle}
        className="relative shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div className={`w-10 h-6 rounded-full transition-colors ${on ? 'bg-primary-main' : 'bg-gray-600'}`}>
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform flex items-center justify-center ${on ? 'translate-x-4' : ''}`}>
            {busy && <Loader2 size={10} className="animate-spin text-gray-600" />}
          </div>
        </div>
      </button>
    </div>
  );
};

export default WebPushToggle;
