import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, PinOff, X, CornerDownRight, FileText } from 'lucide-react';
import { popoverMotion } from '../utils/motion';
import { renderAvatar } from '../constants/avatars';
import type { PinnedMessage } from '../services/signalrService';

interface PinnedMessagesButtonProps {
    pins: PinnedMessage[];
    canPin: boolean;
    myUsername: string;
    onUnpin: (messageId: number) => void;
    onJump: (messageId: number) => void;
    // Başlıktaki diğer ikon butonlarıyla aynı görünüm için
    className?: string;
}

const PANEL_WIDTH = 340;

const formatDate = (ts: number) =>
    new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Oda başlığındaki 📌 butonu ve açılan "Sabitlenmiş Mesajlar" paneli.
const PinnedMessagesButton: React.FC<PinnedMessagesButtonProps> = ({ pins, canPin, myUsername, onUnpin, onJump, className }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const width = Math.min(PANEL_WIDTH, vw - 16);
        let left = rect.right - width;
        if (left < 8) left = 8;
        if (left + width > vw - 8) left = vw - width - 8;
        setPos({ top: rect.bottom + 8, left });
    }, [open]);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setOpen(o => !o)}
                title="Sabitlenmiş mesajlar"
                aria-label="Sabitlenmiş mesajlar"
                className={className ?? 'relative flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer'}
            >
                <Pin size={18} />
                {pins.length > 0 && (
                    <span className="anim-pop absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-main text-white text-[10px] font-bold">
                        {pins.length}
                    </span>
                )}
            </button>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <>
                            <div key="pin-backdrop" className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
                            <motion.div
                                key="pin-panel"
                                {...popoverMotion}
                                style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: Math.min(PANEL_WIDTH, window.innerWidth - 16), zIndex: 100, visibility: pos ? 'visible' : 'hidden', transformOrigin: 'top right' }}
                                className="glass-panel !rounded-2xl overflow-hidden"
                            >
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                    <span className="flex items-center gap-2 text-sm font-bold text-text-main">
                                        <Pin size={15} className="text-primary-main" /> Sabitlenmiş Mesajlar
                                    </span>
                                    <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 transition-colors cursor-pointer" aria-label="Kapat">
                                        <X size={15} />
                                    </button>
                                </div>

                                <div className="max-h-[min(60vh,420px)] overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                                    {pins.length === 0 ? (
                                        <div className="py-8 px-4 text-center">
                                            <div className="mx-auto mb-3 w-11 h-11 rounded-2xl bg-primary-main/10 flex items-center justify-center">
                                                <Pin size={20} className="text-primary-main" />
                                            </div>
                                            <p className="text-sm font-semibold text-text-main">Henüz sabitlenmiş mesaj yok</p>
                                            <p className="mt-1 text-xs text-text-muted">
                                                {canPin ? 'Bir mesajın üzerine gelip 📌 ile sabitleyebilirsin.' : 'Yöneticiler önemli mesajları burada sabitler.'}
                                            </p>
                                        </div>
                                    ) : pins.map(p => (
                                        <div key={p.id} className="group/pin rounded-xl p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-bg-surface flex items-center justify-center text-xs shrink-0">
                                                    {renderAvatar(p.avatarId || 'default')}
                                                </div>
                                                <span className="text-[13px] font-semibold text-text-main truncate">{p.username === myUsername ? 'Sen' : p.username}</span>
                                                <span className="text-[11px] text-text-muted shrink-0">{formatDate(p.timestamp)}</span>
                                                <div className="ml-auto flex gap-1 opacity-100 sm:opacity-0 sm:group-hover/pin:opacity-100 transition-opacity">
                                                    <button onClick={() => { onJump(p.id); setOpen(false); }} title="Mesaja git"
                                                        className="p-1 rounded-lg text-text-muted hover:text-primary-main hover:bg-white/5 transition-colors cursor-pointer">
                                                        <CornerDownRight size={14} />
                                                    </button>
                                                    {canPin && (
                                                        <button onClick={() => onUnpin(p.id)} title="Sabitlemeyi kaldır"
                                                            className="p-1 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                                                            <PinOff size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {p.fileName && (
                                                <div className="mt-2 flex items-center gap-1.5 text-xs text-primary-main">
                                                    <FileText size={12} /> <span className="truncate">{p.fileName}</span>
                                                </div>
                                            )}
                                            {p.text && !(p.fileUrl && p.text.startsWith('[Dosya:')) && (
                                                <p className="mt-1.5 text-[13px] leading-snug text-text-main/90 whitespace-pre-wrap break-words line-clamp-4">{p.text}</p>
                                            )}
                                            {p.pinnedBy && (
                                                <p className="mt-1.5 text-[10px] uppercase tracking-wider text-text-muted/70">📌 {p.pinnedBy} sabitledi</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
};

export default PinnedMessagesButton;
