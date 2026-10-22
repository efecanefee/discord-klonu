import type { Transition, Variants } from 'framer-motion';

// Tek hareket dili: tum modal/popover/liste animasyonlari buradan beslenir.
// Kurallar: giris yay (spring) ile, cikis daha kisa ve tween — kapanan sey
// kullaniciyi bekletmez. Yalnizca transform/opacity/filter animasyonlanir
// (compositor isi), width/height asla.

export const spring = {
  // Butonlar, sekmeler, kucuk ogeler
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } as Transition,
  // Modal ve paneller: belirgin ama tasmayan bir oturma
  smooth: { type: 'spring', stiffness: 340, damping: 30, mass: 0.9 } as Transition,
  // Hafif zıplamalı: bildirim rozetleri, onay ikonlari
  bouncy: { type: 'spring', stiffness: 420, damping: 18, mass: 0.8 } as Transition,
};

export const ease = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  inQuick: [0.4, 0, 1, 1] as const,
};

const exitFast: Transition = { duration: 0.16, ease: ease.inQuick };

// Karartma katmani
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: ease.outExpo } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

// Ortadaki modal kart: asagidan hafif bulanik gelir, yerine yayla oturur.
export const modalMotion = {
  initial: { opacity: 0, scale: 0.94, y: 24, filter: 'blur(6px)' },
  animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: spring.smooth },
  exit: { opacity: 0, scale: 0.97, y: 10, filter: 'blur(4px)', transition: exitFast },
};

// Tetikleyiciye bagli kucuk menuler / popover'lar
export const popoverMotion = {
  initial: { opacity: 0, scale: 0.92, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.12 } },
};

// Sohbet mesaji balonu
export const messageMotion = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring.snappy },
};

// Listeler: ebeveyn cocuklari sirayla sahneye alir
export const staggerParent: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: spring.smooth },
};
