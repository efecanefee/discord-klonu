import React from 'react';
import { Ban } from 'lucide-react';

// Engellenen kullanıcının mesajı yerine görünen satır; istenirse tek tek açılır.
const BlockedMessageStub: React.FC<{ onReveal: () => void }> = ({ onReveal }) => (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-muted">
        <Ban size={13} className="shrink-0 opacity-70" />
        <span>Engellediğin bir kullanıcıdan mesaj</span>
        <button onClick={onReveal} className="font-semibold text-primary-main hover:underline cursor-pointer">Göster</button>
    </div>
);

export default BlockedMessageStub;
