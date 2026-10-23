// Mesh WebRTC icin ortak saglamlastirma yardimcilari (oda ve ses kanali ayni
// mantigi kullanir).
//
// Neden gerekli: 3+ kisilik odalarda bir kisinin sesi bazen digerlerine
// gitmiyor, ancak cik-gir yapinca duzeliyordu. Sebepler:
//  1) Sinyaller (offer/answer/ice) async handler'larda AYNI ANDA isleniyordu.
//     Bir offer islenirken gelen ICE adaylari kuyruga yaziliyor, kuyruk
//     bosaltilirken araya giren aday `set([])` ile siliniyordu. Aday kaybi =
//     baglanti hic kurulmuyor ya da tek yonlu kaliyor.
//  2) Iki taraf ayni anda offer acinca (kamera/ekran, ICE restart) cakisma
//     (glare) oluyordu ve baglanti yarim kaliyordu.
//  3) Kaybolan bir offer/answer (SignalR o an yeniden baglaniyorsa sinyal
//     sessizce dusuyor) peer'i sonsuza dek "baglaniyor"da birakiyordu; ICE
//     baglanmis ama ses paketi gelmeyen durum ise hic fark edilmiyordu.
//
// Cozum: peer basina sirali sinyal kuyrugu + "perfect negotiation" kurali +
// baglanti/medya bekcisi (watchdog) ile otomatik kurtarma.

/** Peer basina isleri sirayla calistirir; bir is bitmeden digeri baslamaz. */
export function createSerialQueue() {
    const chains = new Map<string, Promise<void>>();
    return {
        run(key: string, task: () => Promise<void>): Promise<void> {
            const next = (chains.get(key) ?? Promise.resolve())
                .then(task)
                .catch(e => console.error('[WebRTC] Sinyal isleme hatasi:', e));
            chains.set(key, next);
            return next;
        },
        delete(key: string) { chains.delete(key); },
        clear() { chains.clear(); },
    };
}

/**
 * Cakisma (glare) kurali: iki taraf ayni anda offer acarsa "kibar" taraf
 * kendi offer'ini geri alip karsi tarafinkini kabul eder, "kaba" taraf karsi
 * offer'i yok sayar. Her iki tarafta da ayni sonucu veren deterministik secim.
 */
export function isPolite(myId: string | null | undefined, peerId: string): boolean {
    return (myId ?? '') < peerId;
}

const CHECK_MS = 4000;
// Bu kadar sure 'new'/'checking'de kalan peer takilmis sayilir (offer/answer kaybolmus olabilir)
const CONNECT_TIMEOUT_MS = 12000;
// Baglanti acikken bu kadar ust uste kontrolde ses paketi gelmezse takilmis sayilir (~12 sn)
const MEDIA_STALL_CHECKS = 3;
// Saglikli bir olcum gorulene kadar en fazla bu kadar kurtarma denemesi yapilir
const MAX_RECOVERY_ATTEMPTS = 3;

export type StallReason = 'connect' | 'media';

// Karsi taraf bize ses gonderiyor olmali mi? (mikrofonu olmayan biri recvonly
// anlasir; onu "takildi" sanmayalim.)
function expectsRemoteAudio(pc: RTCPeerConnection): boolean {
    return pc.getTransceivers().some(t =>
        t.receiver.track?.kind === 'audio' &&
        (t.currentDirection === 'sendrecv' || t.currentDirection === 'recvonly'));
}

async function inboundAudioPackets(pc: RTCPeerConnection): Promise<number> {
    let total = 0;
    const stats = await pc.getStats();
    stats.forEach(r => {
        const kind = (r as { kind?: string; mediaType?: string }).kind ?? (r as { mediaType?: string }).mediaType;
        if (r.type === 'inbound-rtp' && kind === 'audio') total += (r as { packetsReceived?: number }).packetsReceived ?? 0;
    });
    return total;
}

/**
 * Peer'i periyodik kontrol eder ve takildigini gorurse `onStall` cagirir:
 *  - 'connect': ICE uzun suredir 'new'/'checking'de (sinyal kaybolmus olabilir)
 *  - 'media': ICE bagli ama karsi taraftan ses paketi gelmiyor
 * 'disconnected'/'failed' durumlarini hook'larin kendi ICE restart mantigi
 * yonetir; burada tekrar ele alinmaz. Deneme sayisi saglikli olcumle sifirlanir.
 * Peer kapaninca kendiliginden durur; donen fonksiyon da durdurur.
 */
export function watchPeerHealth(pc: RTCPeerConnection, onStall: (reason: StallReason, attempt: number) => void): () => void {
    let pendingSince = Date.now();
    let lastPackets = -1;
    let stalledChecks = 0;
    let attempts = 0;
    let busy = false;

    const stall = (reason: StallReason) => {
        if (attempts >= MAX_RECOVERY_ATTEMPTS) return;
        attempts++;
        console.warn(`[WebRTC] Peer takildi (${reason}), kurtarma deneniyor (${attempts}/${MAX_RECOVERY_ATTEMPTS}).`);
        onStall(reason, attempts);
    };

    const timer = window.setInterval(async () => {
        if (pc.signalingState === 'closed') { clearInterval(timer); return; }
        if (busy) return;
        busy = true;
        try {
            const ice = pc.iceConnectionState;
            if (ice === 'new' || ice === 'checking') {
                lastPackets = -1;
                stalledChecks = 0;
                if (Date.now() - pendingSince > CONNECT_TIMEOUT_MS) {
                    pendingSince = Date.now();
                    stall('connect');
                }
                return;
            }
            pendingSince = Date.now();
            if (ice !== 'connected' && ice !== 'completed') { lastPackets = -1; stalledChecks = 0; return; }
            if (!expectsRemoteAudio(pc)) { lastPackets = -1; stalledChecks = 0; attempts = 0; return; }

            const packets = await inboundAudioPackets(pc);
            if (lastPackets >= 0 && packets <= lastPackets) {
                if (++stalledChecks >= MEDIA_STALL_CHECKS) {
                    stalledChecks = 0;
                    stall('media');
                }
            } else {
                if (lastPackets >= 0) attempts = 0; // paket akiyor: saglikli
                stalledChecks = 0;
            }
            lastPackets = packets;
        } catch { /* getStats kapanan peer'da hata verebilir */ } finally {
            busy = false;
        }
    }, CHECK_MS);

    return () => clearInterval(timer);
}
