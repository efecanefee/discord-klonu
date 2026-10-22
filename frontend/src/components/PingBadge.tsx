import React from 'react';
import { pingQuality } from '../hooks/usePing';

const QUALITY_COLOR: Record<ReturnType<typeof pingQuality>, string> = {
    good: 'text-emerald-400',
    ok: 'text-amber-400',
    bad: 'text-red-400',
    unknown: 'text-text-muted',
};

const QUALITY_LABEL: Record<ReturnType<typeof pingQuality>, string> = {
    good: 'İyi bağlantı',
    ok: 'Orta bağlantı',
    bad: 'Zayıf bağlantı',
    unknown: 'Ölçülüyor',
};

// Dört çubuklu sinyal ikonu: kalite düştükçe yanan çubuk sayısı azalır.
export const SignalBars: React.FC<{ ms: number | null | undefined; className?: string }> = ({ ms, className = '' }) => {
    const q = pingQuality(ms);
    const lit = q === 'good' ? 4 : q === 'ok' ? 3 : q === 'bad' ? 1 : 0;
    return (
        <span className={`inline-flex items-end gap-[2px] h-3 ${QUALITY_COLOR[q]} ${className}`} aria-hidden>
            {[0, 1, 2, 3].map(i => (
                <span key={i} className={`w-[3px] rounded-sm bg-current transition-opacity duration-300 ${i < lit ? 'opacity-100' : 'opacity-25'}`}
                    style={{ height: `${(i + 1) * 25}%` }} />
            ))}
        </span>
    );
};

interface PingBadgeProps {
    serverPing: number | null;
    peerPings?: Map<string, number>;
    // connectionId → görünen ad (ipucu listesi için)
    names?: Map<string, string>;
    compact?: boolean;
}

// Ses kontrollerinin yanındaki gecikme rozeti. Gösterilen değer kişilere olan en
// kötü gecikme (ses doğrudan kişiler arasında akar); kimse yoksa sunucu gecikmesi.
const PingBadge: React.FC<PingBadgeProps> = ({ serverPing, peerPings, names, compact }) => {
    const peerValues = peerPings ? [...peerPings.values()] : [];
    const shown = peerValues.length > 0 ? Math.max(...peerValues) : serverPing;
    const q = pingQuality(shown);

    const lines = [
        `${QUALITY_LABEL[q]}`,
        `Sunucu: ${serverPing != null ? `${serverPing} ms` : '—'}`,
        ...[...(peerPings?.entries() ?? [])].map(([id, ms]) => `${names?.get(id) ?? 'Kullanıcı'}: ${ms} ms`),
    ];

    return (
        <span
            title={lines.join('\n')}
            aria-label={`Ping ${shown != null ? `${shown} milisaniye` : 'ölçülüyor'}`}
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} select-none`}
        >
            <SignalBars ms={shown} />
            <span className={`font-mono tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold ${QUALITY_COLOR[q]}`}>
                {shown != null ? `${shown} ms` : '…'}
            </span>
        </span>
    );
};

export default PingBadge;
