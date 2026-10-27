import React, { useRef, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import AnchoredPanel from './AnchoredPanel';
import { isMuted, setMute, useChatPrefs } from '../utils/chatPrefs';

interface MuteMenuButtonProps {
    muteKey: string;
    // "Odayı" / "Sohbeti" — menü başlığında kullanılır
    targetLabel: string;
    // Odalarda bahsetmeler susturmadan etkilenmez; DM'lerde her şey susar
    mentionsStillNotify?: boolean;
    className?: string;
}

const OPTIONS: { label: string; minutes: number | null }[] = [
    { label: '15 dakika', minutes: 15 },
    { label: '1 saat', minutes: 60 },
    { label: '8 saat', minutes: 8 * 60 },
    { label: '24 saat', minutes: 24 * 60 },
    { label: 'Ben açana kadar', minutes: null },
];

const formatUntil = (until: number | null) => {
    if (until === null) return 'Ben açana kadar susturuldu';
    const d = new Date(until);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${sameDay ? '' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' '}${time}'e kadar susturuldu`;
};

// Başlıktaki 🔔 butonu: oda ya da DM bildirimlerini belli bir süre susturur.
const MuteMenuButton: React.FC<MuteMenuButtonProps> = ({ muteKey, targetLabel, mentionsStillNotify, className }) => {
    const prefs = useChatPrefs();
    const muted = isMuted(muteKey, prefs);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const apply = async (minutes: number | null) => {
        setBusy(true);
        const ok = await setMute(muteKey, minutes);
        setBusy(false);
        if (ok) setOpen(false);
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setOpen(o => !o)}
                title={muted ? 'Bildirimler susturuldu' : 'Bildirimleri sustur'}
                aria-label={muted ? 'Bildirimler susturuldu' : 'Bildirimleri sustur'}
                className={className ?? 'relative flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer'}
            >
                {muted ? <BellOff size={18} className="text-amber-300" /> : <Bell size={18} />}
            </button>

            <AnchoredPanel open={open} anchorRef={buttonRef} onClose={() => setOpen(false)} width={250}>
                <div className="px-4 pt-3 pb-2 border-b border-white/5">
                    <div className="text-sm font-bold text-text-main">{targetLabel} sustur</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-text-muted">
                        {muted
                            ? formatUntil(prefs.mutes[muteKey] ?? null)
                            : mentionsStillNotify ? 'Ses ve bildirim gelmez; @bahsetmeler yine bildirilir.' : 'Ses ve bildirim gelmez.'}
                    </div>
                </div>
                <div className="p-1.5">
                    {OPTIONS.map(o => (
                        <button key={o.label} disabled={busy} onClick={() => apply(o.minutes)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-text-main hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50">
                            {o.label}
                            {muted && o.minutes === null && prefs.mutes[muteKey] === null && <Check size={14} className="text-primary-main" />}
                        </button>
                    ))}
                    {muted && (
                        <button disabled={busy} onClick={() => apply(0)}
                            className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-primary-main hover:bg-primary-main/10 transition-colors cursor-pointer disabled:opacity-50">
                            <Bell size={14} /> Susturmayı kaldır
                        </button>
                    )}
                </div>
            </AnchoredPanel>
        </>
    );
};

export default MuteMenuButton;
