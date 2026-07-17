// Ses cikis cihazi (kulaklik/hoparlor) secimi.
//
// setSinkId yalnizca Chrome/Edge'de var; Firefox ve Safari desteklemez.
// Desteklenmeyen tarayicida sessizce isletim sistemi varsayilaninda kalinir —
// hata firlatmak kullaniciya bir sey kazandirmaz.

type MediaElementWithSink = HTMLMediaElement & {
    setSinkId?: (deviceId: string) => Promise<void>;
};

export function isSinkIdSupported(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export async function applySinkId(el: HTMLMediaElement | null, deviceId: string): Promise<void> {
    if (!el || !deviceId) return;

    const target = el as MediaElementWithSink;
    if (typeof target.setSinkId !== 'function') return;

    try {
        await target.setSinkId(deviceId);
    } catch (e) {
        // Cihaz cikarilmis olabilir veya izin yok — varsayilana dus.
        console.warn('[Audio] Ses cikisi ayarlanamadi, varsayilan kullanilacak:', e);
    }
}
