// WebRTC ICE yapilandirmasi — hem Ana Salon (useWebRTC) hem ses kanallari
// (useVoiceChannel) buradan okur.
//
// STUN tek basina yeterli degil: peer'a yalnizca kendi genel adresini soyler,
// trafigi aktaramaz. Simetrik NAT / CGNAT arkasindaki biri (mobil veri,
// universite/kurum agi) STUN ile calisan yol bulamaz ve baglanti sessizce
// basarisiz olur. TURN relay bu durumda tek cozum.
//
// TURN kimlik bilgileri env'den gelir; yoksa yalnizca STUN ile devam edilir
// (yerel gelistirme bozulmasin).
//   VITE_TURN_URL=turn:...
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...

const STUN_URL = 'stun:stun.l.google.com:19302';

export function getIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [{ urls: STUN_URL }];

    const url = import.meta.env.VITE_TURN_URL;
    const username = import.meta.env.VITE_TURN_USERNAME;
    const credential = import.meta.env.VITE_TURN_CREDENTIAL;

    if (url && username && credential) {
        servers.push({ urls: url, username, credential });
    } else if (import.meta.env.PROD) {
        console.warn('[WebRTC] TURN yapilandirilmamis — simetrik NAT arkasindaki kullanicilar baglanamayabilir.');
    }

    return servers;
}

export function getRtcConfig(): RTCConfiguration {
    // iceTransportPolicy varsayilan 'all' kalir: TURN yalnizca dogrudan yol
    // bulunamadiginda devreye girer, bos yere relay bant genisligi harcanmaz.
    return { iceServers: getIceServers() };
}
