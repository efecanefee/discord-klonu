import React from 'react';

// Düzenlenmiş mesajın metninin sonuna eklenen küçük etiket
const EditedTag: React.FC = () => (
  <span className="ml-1.5 align-baseline text-[10px] font-medium opacity-60 select-none whitespace-nowrap" title="Bu mesaj düzenlendi">
    (düzenlendi)
  </span>
);

export default EditedTag;
