import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoverPortalProps {
  anchorRect: DOMRect | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

// Popover'ı document.body'ye taşır — üstteki overflow/transform'lu kapsayıcılar
// tarafından kırpılmasını önler. Tıklanan satırın konumuna göre fixed konumlanır.
const PopoverPortal: React.FC<PopoverPortalProps> = ({ anchorRect, onClose, children, width = 224 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = ref.current?.offsetHeight ?? 300;

    // Yatay: önce satırın soluna, sığmazsa sağına
    let left = anchorRect.left - width - gap;
    if (left < 8) left = anchorRect.right + gap;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);

    // Dikey: satırın üstüyle hizala, ekrandan taşarsa yukarı kaydır
    let top = anchorRect.top;
    if (top + h > vh - 8) top = vh - h - 8;
    if (top < 8) top = 8;

    setPos({ top, left });
  }, [anchorRect, width]);

  if (!anchorRect) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: pos?.top ?? anchorRect.top,
          left: pos?.left ?? anchorRect.left,
          zIndex: 100,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
};

export default PopoverPortal;
