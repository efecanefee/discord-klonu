import React, { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { saveMessage, type SavedMessage } from '../utils/chatPrefs';

type SavePayload = Omit<SavedMessage, 'id' | 'savedAt' | 'authorAvatarId'> & { authorAvatarId?: string };

interface SaveMessageButtonProps {
    payload: () => SavePayload;
    className?: string;
    iconClassName?: string;
    size?: number;
}

// Mesaj üzerindeki 🔖 butonu: mesajın kopyasını "Kaydedilenler"e ekler.
const SaveMessageButton: React.FC<SaveMessageButtonProps> = ({ payload, className, iconClassName, size = 12 }) => {
    const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');

    const onClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (state !== 'idle') return;
        setState('busy');
        const err = await saveMessage(payload());
        if (err) { alert(err); setState('idle'); return; }
        setState('done');
        window.setTimeout(() => setState('idle'), 2000);
    };

    return (
        <button onClick={onClick} disabled={state === 'busy'} title={state === 'done' ? 'Kaydedildi' : 'Kaydet'} aria-label="Mesajı kaydet"
            className={className ?? 'w-6 h-6 rounded-full bg-bg-surface border border-border-main hover:bg-border-main flex items-center justify-center cursor-pointer'}>
            {state === 'done'
                ? <BookmarkCheck size={size} className="text-emerald-400" />
                : <Bookmark size={size} className={iconClassName ?? 'text-text-main'} />}
        </button>
    );
};

export default SaveMessageButton;
