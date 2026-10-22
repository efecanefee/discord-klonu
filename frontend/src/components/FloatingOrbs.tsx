import { memo, type CSSProperties } from 'react';

// Arka planda asagidan yukari cok yavas suzulen bulanik isik kureleri.
// Lav lambasinin ustunde, cam panellerin altinda durur. Degerler sabit bir
// tohumdan uretilir: her render'da ayni dizilim, React tarafinda hic state yok.
// Butun hareket CSS'te (index.css: .orb), yalnizca transform/opacity.

const ORB_COUNT = 18;

// Kucuk, deterministik sozde rastgele uretec (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORBS = (() => {
  const r = rng(20261022);
  return Array.from({ length: ORB_COUNT }, (_, i) => {
    const size = 6 + Math.round(r() * 34);        // 6–40px
    const duration = 28 + Math.round(r() * 34);   // 28–62s: cok yavas
    return {
      left: `${Math.round(r() * 100)}%`,
      size,
      duration,
      // Negatif gecikme: sayfa acildiginda kureler ekrana zaten dagilmis olur
      delay: -Math.round(r() * duration),
      drift: `${Math.round((r() - 0.5) * 14)}vw`,
      blur: size > 26 ? 6 : size > 14 ? 3 : 1.5,
      opacity: 0.35 + r() * 0.45,
      tone: i % 3, // 0: ana renk, 1: acik ton, 2: beyazimsi
    };
  });
})();

const FloatingOrbs = memo(function FloatingOrbs() {
  return (
    <div className="orbs" aria-hidden>
      {ORBS.map((o, i) => (
        <span
          key={i}
          className={`orb orb-tone-${o.tone}`}
          style={{
            left: o.left,
            width: o.size,
            height: o.size,
            animationDuration: `${o.duration}s`,
            animationDelay: `${o.delay}s`,
            filter: `blur(${o.blur}px)`,
            '--orb-drift': o.drift,
            '--orb-opacity': o.opacity,
          } as CSSProperties}
        />
      ))}
    </div>
  );
});

export default FloatingOrbs;
