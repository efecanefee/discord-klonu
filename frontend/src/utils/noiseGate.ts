// Gurultu kapisi (noise gate) — Discord'daki "Giris Hassasiyeti"nin karsiligi.
//
// Tarayicinin kendi `noiseSuppression` kisitlamasi yalnizca duragan gurultuyu
// (fan, ugultu) bastirir; klavye sesi, TV, arka plan konusmasi gecer. Kapi ise
// ses seviyesi esigin altindayken mikrofonu tamamen susturur.
//
// Sinyal yolu:
//   MediaStreamSource -> Analyser (RMS olcumu) -> Gain (kapi) -> Destination
//                                                                 `-> peer'lara giden track
//
// AudioWorklet yerine Analyser + Gain kullaniliyor: ayri worklet dosyasi ve
// Vite bundling ayari gerektirmiyor, ayni seviye degeri UI olcer cubugunda
// tekrar kullanilabiliyor.

const ATTACK_SEC = 0.01;   // kapi acilirken — hizli, yoksa kelime basi kirpilir
const RELEASE_SEC = 0.15;  // kapanirken — yavas, yoksa ses kesik kesik olur
const HOLD_MS = 250;       // esik altina dusunce bu kadar bekle. Cumle ici kisa
                           // duraklamalarda kapi kapanmasin diye sart.
const TICK_MS = 20;

export interface NoiseGate {
    /** Peer'lara gonderilecek islenmis stream. */
    readonly stream: MediaStream;
    /** Anlik giris seviyesi (0-100) — UI olcer cubugu icin. */
    getLevel(): number;
    /** Esik (0-100). */
    setThreshold(value: number): void;
    /** Kapali iken kapi hep acik kalir (ses her zaman gecer). */
    setEnabled(value: boolean): void;
    destroy(): void;
}

/**
 * Ham mikrofon stream'ini gurultu kapisindan gecirir.
 * Dikkat: `source` stream'in track'lerini bu fonksiyon durdurmaz — cagiran
 * kendi referansini tutup `stop()` etmeli, yoksa mikrofon isigi sonmez.
 */
export function createNoiseGate(
    source: MediaStream,
    opts: { threshold: number; enabled: boolean }
): NoiseGate {
    const ctx = new AudioContext();
    // Kullanici etkilesimi olmadan acilan AudioContext 'suspended' baslayabilir;
    // o zaman kapidan cikan track sessiz kalir ve karsi taraf bizi hic duymaz
    // (biz onlari duymaya devam ederiz). Hemen, durum degisince ve ilk
    // etkilesimde yeniden baslat.
    const resume = () => {
        if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') ctx.resume().catch(() => { /* etkilesim bekleniyor */ });
    };
    resume();
    ctx.onstatechange = resume;
    const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;
    GESTURES.forEach(e => window.addEventListener(e, resume, true));
    const srcNode = ctx.createMediaStreamSource(source);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();

    srcNode.connect(analyser);
    analyser.connect(gain);
    gain.connect(dest);

    let threshold = opts.threshold;
    let enabled = opts.enabled;
    let level = 0;
    let openUntil = 0;
    let isOpen = true;
    gain.gain.value = 1;

    const data = new Uint8Array(analyser.fftSize);

    const open = () => {
        if (!isOpen) { isOpen = true; gain.gain.setTargetAtTime(1, ctx.currentTime, ATTACK_SEC); }
    };

    // Arka plandaki sekmede tarayici zamanlayicilari yavaslatir (saniyede bire,
    // uzun surede dakikada bire kadar). Kapi kapaliyken boyle olursa konusma
    // gec aciliyor ya da hic gitmiyordu (or. oyun oynarken). Sekme gizliyken
    // kapi acik kalir; tarayicinin kendi gurultu bastirmasi calismaya devam eder.
    const onVisibility = () => { if (document.hidden) open(); };
    document.addEventListener('visibilitychange', onVisibility);

    const tick = () => {
        analyser.getByteTimeDomainData(data);

        // RMS — byte veride sessizlik 128 civarinda salinir.
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // 0-100'e olcekle. Konusma tipik olarak dusuk RMS'te kaldigi icin
        // dogrusal esleme kaydiriciyi kullanissiz yapiyor; karekok ile ac.
        level = Math.min(100, Math.sqrt(rms) * 100);

        if (!enabled || document.hidden) {
            open();
            return;
        }

        const now = Date.now();
        if (level >= threshold) {
            openUntil = now + HOLD_MS;
            open();
        } else if (isOpen && now > openUntil) {
            isOpen = false;
            gain.gain.setTargetAtTime(0, ctx.currentTime, RELEASE_SEC);
        }
    };

    const interval = window.setInterval(tick, TICK_MS);

    return {
        stream: dest.stream,
        getLevel: () => level,
        setThreshold: (v: number) => { threshold = v; },
        setEnabled: (v: boolean) => { enabled = v; },
        destroy: () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            GESTURES.forEach(e => window.removeEventListener(e, resume, true));
            ctx.onstatechange = null;
            try { srcNode.disconnect(); analyser.disconnect(); gain.disconnect(); } catch { /* zaten kopmus */ }
            ctx.close().catch(() => { /* zaten kapali */ });
        },
    };
}
