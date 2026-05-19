import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
    {
        label: '😊 Yüzler',
        emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇',
            '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑',
            '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
            '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
            '🤮', '🥵', '🥶', '😱', '😨', '😰', '😥', '😢', '😭', '😤', '😡', '🤬',
            '🥺', '😳', '🥴', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😣', '😖'],
    },
    {
        label: '👋 El & Jest',
        emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟',
            '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
            '🤜', '👏', '🙌', '🫶', '👐', '🤝', '🙏', '💪', '🫡', '🫠'],
    },
    {
        label: '❤️ Kalpler',
        emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💞', '💓',
            '💗', '💖', '💘', '💝', '💔', '❤️‍🔥', '❤️‍🩹', '🫀', '💋', '💯', '💢', '💥',
            '💫', '💦', '💨', '🕳️', '💣', '💬', '🗯️', '💭'],
    },
    {
        label: '🎉 Kutlama',
        emojis: ['🎉', '🎊', '🎈', '🎂', '🎁', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️',
            '🎯', '🎮', '🎲', '🎸', '🎵', '🎶', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷',
            '🔥', '⭐', '🌟', '✨', '💎', '🚀', '🌈', '☀️'],
    },
    {
        label: '🍕 Yiyecek',
        emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🥚', '🥓', '🥩', '🍗', '🍖', '🦴',
            '🌮', '🌯', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🍙', '🍚', '🍘',
            '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂', '🍷'],
    },
];

interface EmojiPickerProps {
    onEmojiSelect: (emoji: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onEmojiSelect, isOpen, onClose }) => {
    const [activeCategory, setActiveCategory] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
    const filteredEmojis = searchQuery
        ? allEmojis.filter(() => true) // Emojiler text aramasıyla filtrelenmez, hepsini göster
        : EMOJI_CATEGORIES[activeCategory]?.emojis ?? [];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Dış tıklama kapatma overlay */}
                    <div className="fixed inset-0 z-40" onClick={onClose} />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-2 left-0 z-50 w-[340px] rounded-2xl overflow-hidden shadow-2xl"
                        style={{
                            background: 'var(--color-bg-card, #1a2035)',
                            border: '1px solid var(--color-border-main, #242b3d)',
                        }}
                    >
                        {/* Arama */}
                        <div className="px-3 pt-3 pb-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Emoji ara..."
                                className="w-full bg-bg-surface border border-border-main rounded-xl px-3 py-2 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary-main"
                            />
                        </div>

                        {/* Kategori tabları */}
                        {!searchQuery && (
                            <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
                                {EMOJI_CATEGORIES.map((cat, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveCategory(i)}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${activeCategory === i
                                            ? 'bg-primary-main/15 text-primary-main'
                                            : 'text-text-muted hover:text-text-main hover:bg-bg-surface'
                                            }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Emoji grid */}
                        <div className="px-2 pb-3 h-[200px] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-8 gap-0.5">
                                {(searchQuery ? allEmojis : filteredEmojis).map((emoji, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            onEmojiSelect(emoji);
                                            onClose();
                                        }}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-bg-surface text-[20px] transition-colors cursor-pointer active:scale-90"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default EmojiPicker;
