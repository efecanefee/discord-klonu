import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkX, Copy, FileText, Hash, MessageSquare, X } from 'lucide-react';
import AnchoredPanel from './AnchoredPanel';
import { renderAvatar } from '../constants/avatars';
import { renderMarkdown } from '../utils/markdown';
import { deleteSavedMessage, fetchSavedMessages, SAVED_CHANGED_EVENT, type SavedMessage } from '../utils/chatPrefs';

interface SavedMessagesButtonProps {
    className?: string;
}

const formatDate = (ts: number) =>
    new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Başlıktaki 🔖 butonu ve "Kaydedilenler" paneli. Kayıtlar mesajın kopyasıdır,
// oda mesajları silinse de kalır.
const SavedMessagesButton: React.FC<SavedMessagesButtonProps> = ({ className }) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<SavedMessage[] | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        const load = () => fetchSavedMessages().then(list => { if (alive) setItems(list); });
        load();
        window.addEventListener(SAVED_CHANGED_EVENT, load);
        return () => { alive = false; window.removeEventListener(SAVED_CHANGED_EVENT, load); };
    }, [open]);

    const remove = async (id: number) => {
        setItems(prev => prev?.filter(i => i.id !== id) ?? null);
        if (!await deleteSavedMessage(id)) fetchSavedMessages().then(setItems);
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setOpen(o => !o)}
                title="Kaydedilen mesajlar"
                aria-label="Kaydedilen mesajlar"
                className={className ?? 'relative flex items-center justify-center p-2.5 rounded-xl border bg-bg-base border-border-main text-text-muted hover:text-primary-main hover:border-primary-main/40 transition-colors cursor-pointer'}
            >
                <Bookmark size={18} />
            </button>

            <AnchoredPanel open={open} anchorRef={buttonRef} onClose={() => setOpen(false)} width={360}>
                <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="flex items-center gap-2 text-sm font-bold text-text-main">
                        <Bookmark size={15} className="text-primary-main" /> Kaydedilenler
                    </span>
                    <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 transition-colors cursor-pointer" aria-label="Kapat">
                        <X size={15} />
                    </button>
                </div>
                <div className="min-h-0 max-h-[min(65vh,480px)] overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                    {items === null ? (
                        <div className="py-8 text-center text-xs text-text-muted">Yükleniyor...</div>
                    ) : items.length === 0 ? (
                        <div className="py-8 px-4 text-center">
                            <div className="mx-auto mb-3 w-11 h-11 rounded-2xl bg-primary-main/10 flex items-center justify-center">
                                <Bookmark size={20} className="text-primary-main" />
                            </div>
                            <p className="text-sm font-semibold text-text-main">Henüz kaydettiğin mesaj yok</p>
                            <p className="mt-1 text-xs text-text-muted">Bir mesajın üzerine gelip 🔖 ile kaydedebilirsin. Oda mesajları silinse de burada kalır.</p>
                        </div>
                    ) : items.map(m => (
                        <div key={m.id} className="group/saved rounded-xl p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full overflow-hidden bg-bg-surface flex items-center justify-center text-xs shrink-0">
                                    {renderAvatar(m.authorAvatarId || 'default')}
                                </div>
                                <span className="text-[13px] font-semibold text-text-main truncate">{m.author}</span>
                                <span className="text-[11px] text-text-muted shrink-0">{formatDate(m.messageTs || m.savedAt)}</span>
                                <div className="ml-auto flex gap-1 opacity-100 sm:opacity-0 sm:group-hover/saved:opacity-100 transition-opacity">
                                    {m.text && (
                                        <button onClick={() => navigator.clipboard.writeText(m.text)} title="Kopyala"
                                            className="p-1 rounded-lg text-text-muted hover:text-primary-main hover:bg-white/5 transition-colors cursor-pointer">
                                            <Copy size={14} />
                                        </button>
                                    )}
                                    <button onClick={() => remove(m.id)} title="Kayıttan çıkar"
                                        className="p-1 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                                        <BookmarkX size={14} />
                                    </button>
                                </div>
                            </div>
                            {m.location && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
                                    {m.kind === 'dm' ? <MessageSquare size={11} /> : <Hash size={11} />}
                                    <span className="truncate">{m.location}</span>
                                </div>
                            )}
                            {m.fileUrl && (
                                <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-xs text-primary-main hover:underline">
                                    <FileText size={12} /> <span className="truncate">{m.fileName || 'Dosya'}</span>
                                </a>
                            )}
                            {m.text && !(m.fileUrl && m.text.startsWith('[Dosya:')) && (
                                <p className="mt-1.5 text-[13px] leading-snug text-text-main/90 whitespace-pre-wrap break-words line-clamp-6">
                                    {renderMarkdown(m.text, `sv${m.id}`, (t, k) => <React.Fragment key={k}>{t}</React.Fragment>)}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </AnchoredPanel>
        </>
    );
};

export default SavedMessagesButton;
