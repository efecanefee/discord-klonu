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
//   VITE_TURN_URL=turn:a.metered.ca:80,turn:a.metered.ca:443,turns:a.metered.ca:443?transport=tcp
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...
//
// VITE_TURN_URL virgulle ayrilmis birden fazla URL alir ve HEPSI verilmelidir.
// Saglayicilar (Metered vb.) ayni kullanici/parola ile farkli port ve protokol
// varyantlari sunar; tek bir tanesi yetmez:
//   - turn:...:80        UDP — en hizli, ama kisitli aglarda UDP bloklu olabilir
//   - turn:...:443       TCP fallback
//   - turns:...:443?transport=tcp   TLS — kurum/universite guvenlik duvarlarinin
//     HTTPS sandigi tek yol. Cogu zaman baglantiyi kurtaran budur.
// Tarayici bunlari paralel dener ve calisani secer.

const STUN_URL = 'stun:stun.l.google.com:19302';

export function getIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [{ urls: STUN_URL }];

    const urls = (import.meta.env.VITE_TURN_URL ?? '')
        .split(',')
        .map((u: string) => u.trim())
        .filter(Boolean);
    const username = import.meta.env.VITE_TURN_USERNAME;
    const credential = import.meta.env.VITE_TURN_CREDENTIAL;

    if (urls.length > 0 && username && credential) {
        servers.push({ urls, username, credential });
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
