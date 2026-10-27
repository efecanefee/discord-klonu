import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { popoverMotion } from '../utils/motion';

interface AnchoredPanelProps {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement | null>;
    onClose: () => void;
    width: number;
    children: React.ReactNode;
}

// Başlık butonlarının altında açılan, ekran kenarına taşmayan panel (portal ile).
const AnchoredPanel: React.FC<AnchoredPanelProps> = ({ open, anchorRef, onClose, width, children }) => {
    // Altta yer yoksa (ör. sol panelin dibindeki buton) panel butonun üstünde açılır
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number; up: boolean } | null>(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const w = Math.min(width, vw - 16);
        let left = rect.right - w;
        if (left < 8) left = 8;
        if (left + w > vw - 8) left = vw - w - 8;
        const vh = window.innerHeight;
        const below = vh - rect.bottom - 16;
        const above = rect.top - 16;
        if (below >= 320 || below >= above) setPos({ top: rect.bottom + 8, left, maxHeight: below, up: false });
        else setPos({ bottom: vh - rect.top + 8, left, maxHeight: above, up: true });
    }, [open, anchorRef, width]);

    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    <div key="ap-backdrop" className="fixed inset-0 z-[90]" onClick={onClose} />
                    <motion.div
                        key="ap-panel"
                        {...popoverMotion}
                        style={{ position: 'fixed', top: pos?.top, bottom: pos?.bottom, left: pos?.left ?? 0, maxHeight: pos?.maxHeight, width: Math.min(width, window.innerWidth - 16), zIndex: 100, visibility: pos ? 'visible' : 'hidden', transformOrigin: pos?.up ? 'bottom right' : 'top right' }}
                        className="glass-panel !rounded-2xl overflow-hidden flex flex-col"
                    >
                        {children}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body,
    );
};

export default AnchoredPanel;
