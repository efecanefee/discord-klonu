import React, { useState } from 'react';

// ||gizli metin||: tıklanana kadar kapalı durur. Tıklama mesajın kopyalama
// davranışına gitmesin diye ilk tıklamada yayılım durdurulur.
const Spoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      role={open ? undefined : 'button'}
      title={open ? undefined : 'Spoiler — göstermek için tıkla'}
      onClick={e => { if (!open) { e.stopPropagation(); setOpen(true); } }}
      className={`rounded px-0.5 transition-colors ${open ? 'bg-white/10' : 'bg-zinc-600 text-transparent cursor-pointer select-none hover:bg-zinc-500 [&_*]:invisible'}`}
    >
      {children}
    </span>
  );
};

export default Spoiler;
