import { useState, useEffect, useRef, useCallback } from 'react';
import signalrService from '../services/signalrService';
import { useSettings } from '../contexts/SettingsContext';
import { getRtcConfig } from '../config/webrtc';
import { createNoiseGate, type NoiseGate } from '../utils/noiseGate';
import { playConnectionLostSound } from '../utils/sound';

// Kopan bir peer icin ust uste en fazla kac ICE restart denenir
const MAX_ICE_RESTARTS = 3;

export interface DeviceInfo {
    deviceId: string;
    label: string;
}

export function useWebRTC() {
    const { settings, updateSettings } = useSettings();
    const noiseSuppression = settings.noiseSuppression;
    // Cihaz secimi tek kaynaktan (SettingsContext) okunur; boylece Ayarlar
    // penceresi ile oda ici cihaz menusu ayni degeri gosterir.
    const selectedMicId = settings.microphoneId;
    const selectedOutputId = settings.speakerId;

    // Yeni kapi olustururken baslangic degerleri buradan okunur. Ref, cunku
    // openMicStream'in kimligi ayar degisince degismemeli.
    const gateSettingsRef = useRef({
        enabled: settings.noiseGateEnabled,
        threshold: settings.noiseGateThreshold,
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    // ICE'i kalici olarak basarisiz olan peer'lar — UI'da uyari gostermek icin.
    const [connectionIssues, setConnectionIssues] = useState<Set<string>>(new Set());
    const analyserRefs = useRef<Map<string, { analyser: AnalyserNode, interval: number }>>(new Map());

    // Cihaz listesi
    const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);

    const setSelectedOutputId = useCallback((deviceId: string) => {
        updateSettings({ speakerId: deviceId });
    }, [updateSettings]);

    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    // Her peer'dan gelen track'ler — karsi tarafin hangi stream'e ekledigine
    // bakmadan biz tutariz. Onceden ontrack'teki event.streams[0] haritaya
    // yaziliyordu; kamera/ekran track'i baska bir stream'le gelince mikrofonlu
    // stream'in yerini aliyor ve karsi tarafin sesi kesiliyordu.
    const remoteTracks = useRef<Map<string, Set<MediaStreamTrack>>>(new Map());
    // streamRef = peer'lara giden islenmis stream (gurultu kapisindan gecmis).
    // rawStreamRef = ham mikrofon; yalnizca stop() icin tutulur, yoksa mikrofon
    // isigi sonmez.
    const streamRef = useRef<MediaStream | null>(null);
    const rawStreamRef = useRef<MediaStream | null>(null);
    const gateRef = useRef<NoiseGate | null>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    // Cihazları listele
    const loadDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices
                .filter(d => d.kind === 'audioinput')
                .map(d => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${d.deviceId.slice(0, 4)}` }));
            const outputs = devices
                .filter(d => d.kind === 'audiooutput')
                .map(d => ({ deviceId: d.deviceId, label: d.label || `Çıkış ${d.deviceId.slice(0, 4)}` }));
            setAudioInputs(mics);
            setAudioOutputs(outputs);
        } catch (e) {
            console.error('[WebRTC] Cihaz listesi alınamadı:', e);
        }
    }, []);

    // Belirli mikrofon ile stream aç. deviceId verilmezse ayarlardaki mikrofon
    // kullanilir ('default' ise tarayiciya birakilir). Donen `processed` stream
    // gurultu kapisindan gecmistir ve peer'lara o gonderilir.
    const openMicStream = useCallback(async (deviceId?: string) => {
        const wanted = deviceId ?? selectedMicId;
        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    ...(wanted && wanted !== 'default' ? { deviceId: { exact: wanted } } : {}),
                    noiseSuppression: noiseSuppression ? { ideal: true } : { ideal: false },
                    echoCancellation: noiseSuppression ? { ideal: true } : { ideal: false },
                    autoGainControl: noiseSuppression ? { ideal: true } : { ideal: false }
                },
                video: false
            };
            const raw = await navigator.mediaDevices.getUserMedia(constraints);
            const gate = createNoiseGate(raw, gateSettingsRef.current);
            return { raw, processed: gate.stream, gate };
        } catch (e) {
            console.error('[WebRTC] Mikrofon açılamadı:', e);
            return null;
        }
    }, [noiseSuppression, selectedMicId]);

    // Mikrofon değiştir — yalnizca ayari yazar. Asil stream degisimini asagidaki
    // effect yapar; boylece Ayarlar penceresinden yapilan degisiklik de ayni
    // yoldan gecer ve iki farkli kod yolu olusmaz.
    const switchMicrophone = useCallback((deviceId: string) => {
        updateSettings({ microphoneId: deviceId });
    }, [updateSettings]);

    // Tüm peer'larla yeniden anlaş (track eklendi/çıkarıldı)
    const renegotiate = async (pc: RTCPeerConnection, connId: string, label: string) => {
        try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await pc.setLocalDescription(offer);
            signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connId);
        } catch (e) {
            console.error(`[WebRTC] ${label} renegotiation hatası:`, e);
        }
    };

    // Verilen track'leri gönderen sender'ları kaldır. Sender'ı "ilk video
    // sender" diye değil track kimliğiyle buluyoruz: kamera ve ekran aynı anda
    // açıkken kamerayı kapatmak eskiden ekran paylaşımını kesebiliyordu.
    const stopSending = (tracks: MediaStreamTrack[], signalType: 'camera-stopped' | 'screen-stopped', label: string) => {
        peerConnections.current.forEach(async (pc, connId) => {
            const senders = pc.getSenders().filter(s => s.track && tracks.includes(s.track));
            if (senders.length > 0) {
                senders.forEach(s => pc.removeTrack(s));
                await renegotiate(pc, connId, label);
            }
            // Karşı tarafa bildir (güvenilir fallback)
            signalrService.sendSignalToUser(JSON.stringify({ type: signalType }), connId);
        });
    };

    // Kamera aç/kapat
    const toggleCamera = useCallback(async () => {
        if (isCameraOn) {
            const tracks = videoStreamRef.current?.getTracks() ?? [];
            tracks.forEach(t => t.stop());
            videoStreamRef.current = null;
            setLocalVideoStream(null);
            setIsCameraOn(false);
            stopSending(tracks, 'camera-stopped', 'Camera stop');
        } else {
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                videoStreamRef.current = videoStream;
                setLocalVideoStream(videoStream);
                setIsCameraOn(true);

                // Peer'lara video track ekle + renegotiation. Mevcut bir video
                // sender'ı (ekran paylaşımı olabilir) değiştirmiyoruz, ayrı ekliyoruz.
                const videoTrack = videoStream.getVideoTracks()[0];
                peerConnections.current.forEach(async (pc, connId) => {
                    pc.addTrack(videoTrack, streamRef.current ?? videoStream);
                    await renegotiate(pc, connId, 'Kamera');
                });
            } catch (e) {
                console.error('[WebRTC] Kamera açılamadı:', e);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCameraOn]);

    // Ekran paylaşımı aç/kapat
    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) {
            const tracks = screenStreamRef.current?.getTracks() ?? [];
            tracks.forEach(t => t.stop());
            screenStreamRef.current = null;
            setScreenStream(null);
            setIsScreenSharing(false);
            stopSending(tracks, 'screen-stopped', 'Screen stop');
        } else {
            try {
                const display = await navigator.mediaDevices.getDisplayMedia({
                    // 1080p hedefle (tarayıcı kaynağa göre düşürebilir); 30fps üstü
                    // bant genişliğini boşa harcar, metin netliği çözünürlükten gelir.
                    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
                    // Ekran sesi: yankı/gürültü filtresi müziği ve oyun sesini bozar
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                });

                // Kullanıcı tarayıcıdan durdurursa — tam cleanup yap (peer connections dahil)
                display.getVideoTracks()[0].onended = () => {
                    if (screenStreamRef.current !== display) return;
                    const tracks = display.getTracks();
                    tracks.forEach(t => t.stop());
                    screenStreamRef.current = null;
                    setScreenStream(null);
                    setIsScreenSharing(false);
                    stopSending(tracks, 'screen-stopped', 'Browser-stop');
                };

                screenStreamRef.current = display;
                setScreenStream(display);
                setIsScreenSharing(true);

                const screenTrack = display.getVideoTracks()[0];
                // Ekran sesi yalnızca kullanıcı paylaşım penceresinde "sesi de paylaş"ı
                // seçtiyse gelir (Chrome: sekme veya tüm ekran). Eskiden hiç gönderilmiyordu.
                const screenAudioTrack = display.getAudioTracks()[0];
                // Metin/detay odaklı içerik ipucu: encoder keskinliği önceliklendirir
                try { screenTrack.contentHint = 'detail'; } catch { /* eski tarayıcı */ }
                peerConnections.current.forEach(async (pc, connId) => {
                    const sender = pc.addTrack(screenTrack, streamRef.current ?? display);
                    if (screenAudioTrack) pc.addTrack(screenAudioTrack, streamRef.current ?? display);
                    // Kalite: bitrate tavanını yükselt + çözünürlüğü koru (kare hızından feda et).
                    // WebRTC'nin varsayılan ~2.5Mbps tavanı ekran metnini bulanıklaştırıyor.
                    try {
                        const params = sender.getParameters();
                        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
                        params.encodings[0].maxBitrate = 5_000_000; // 5 Mbps
                        params.degradationPreference = 'maintain-resolution';
                        await sender.setParameters(params);
                    } catch { /* setParameters desteklenmeyen tarayıcıda varsayılan kalır */ }
                    await renegotiate(pc, connId, 'Ekran');
                });
            } catch (e) {
                console.error('[WebRTC] Ekran paylaşımı başlatılamadı:', e);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isScreenSharing]);

    useEffect(() => {
        let isMounted = true;

        const createPeerConnection = (targetConnectionId: string) => {
            const pc = new RTCPeerConnection(getRtcConfig());
            iceCandidateQueues.current.set(targetConnectionId, []);

            // Audio track ekle
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, streamRef.current!);
                });
            }
            // Video track ekle (varsa)
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, videoStreamRef.current!);
                });
            }
            // Ekran track ekle (varsa) — geç katılan da yüksek kaliteli alsın
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(track => {
                    const sender = pc.addTrack(track, screenStreamRef.current!);
                    if (track.kind === 'video') {
                        try {
                            const params = sender.getParameters();
                            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
                            params.encodings[0].maxBitrate = 5_000_000;
                            params.degradationPreference = 'maintain-resolution';
                            sender.setParameters(params).catch(() => { /* varsayılan kalır */ });
                        } catch { /* desteklenmiyorsa varsayılan */ }
                    }
                });
            }

            pc.onicecandidate = event => {
                if (event.candidate) {
                    signalrService.sendSignalToUser(
                        JSON.stringify({ type: 'ice', candidate: event.candidate }),
                        targetConnectionId
                    );
                }
            };

            // Peer'in canli track'lerinden yeni bir MediaStream yayinla (yeni nesne
            // ki React ve <audio>/<video> elemanlari degisikligi gorsun).
            const publishRemote = () => {
                const set = remoteTracks.current.get(targetConnectionId);
                const live = set ? [...set].filter(t => t.readyState === 'live') : [];
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    if (live.length > 0) newMap.set(targetConnectionId, new MediaStream(live));
                    else newMap.delete(targetConnectionId);
                    return newMap;
                });
            };

            pc.ontrack = event => {
                const track = event.track;
                let set = remoteTracks.current.get(targetConnectionId);
                if (!set) { set = new Set(); remoteTracks.current.set(targetConnectionId, set); }
                set.add(track);

                const drop = () => {
                    if (remoteTracks.current.get(targetConnectionId)?.delete(track)) publishRemote();
                };
                track.addEventListener('ended', drop);
                // Karsi taraf removeTrack + yeniden anlasma yapinca track kendi stream'inden cikar
                event.streams.forEach(st => st.addEventListener('removetrack', e => { if (e.track === track) drop(); }));
                publishRemote();

                // Speaking indicator — yalnizca ilk ses track'i (mikrofon) icin; ekran sesi konusma sayilmasin
                if (track.kind === 'audio' && !analyserRefs.current.has(targetConnectionId)) {
                    try {
                        const audioCtx = new window.AudioContext();
                        // remoteStream yerine sadece bu track'ten oluşan yeni bir stream kullan,
                        // aksi halde stream içinde sessiz video track varsa hata fırlatabilir.
                        const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
                        const analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 512;
                        source.connect(analyser);
                        const data = new Uint8Array(analyser.frequencyBinCount);

                        const interval = window.setInterval(() => {
                            analyser.getByteFrequencyData(data);
                            const avg = data.reduce((a, b) => a + b, 0) / data.length;
                            setSpeakingUsers(prev => {
                                const next = new Set(prev);
                                if (avg > 8) { next.add(targetConnectionId); }
                                else { next.delete(targetConnectionId); }
                                return next;
                            });
                        }, 100);

                        analyserRefs.current.set(targetConnectionId, { analyser, interval });
                    } catch (err) {
                        console.error('[WebRTC] Analyser oluşturulamadı:', err);
                    }
                }
            };

            let iceRestarts = 0;
            let disconnectTimer: number | null = null;
            let issueTimer: number | null = null;
            const markIssue = () => setConnectionIssues(prev => prev.has(targetConnectionId) ? prev : new Set(prev).add(targetConnectionId));
            // Glare onleme: iki taraf ayni anda restart ederse cakisir. Deterministik
            // tie-break: yalnizca connectionId'si buyuk olan taraf yeniden offer acar,
            // digeri yanit vermekle yetinir. Tek deneme yetmiyordu; 3 kez denenir.
            const tryIceRestart = async (): Promise<boolean> => {
                const myId = signalrService.connectionId ?? '';
                if (pc.signalingState === 'closed' || iceRestarts >= MAX_ICE_RESTARTS || myId <= targetConnectionId) return false;
                iceRestarts++;
                console.warn(`[WebRTC ICE] ${targetConnectionId} kopuk, ICE restart deneniyor (${iceRestarts}/${MAX_ICE_RESTARTS}).`);
                try {
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), targetConnectionId);
                    return true;
                } catch (e) {
                    console.error('[WebRTC] ICE restart hatasi:', e);
                    return false;
                }
            };
            pc.oniceconnectionstatechange = async () => {
                const state = pc.iceConnectionState;
                console.log(`[WebRTC ICE] ${targetConnectionId} -> ${state}`);
                if (disconnectTimer && state !== 'disconnected') { clearTimeout(disconnectTimer); disconnectTimer = null; }

                if (state === 'disconnected') {
                    // Kisa ag dalgalanmasinda kendiliginden duzelir; 5 sn surerse
                    // 'failed'i beklemeden (bu 30 sn'yi bulabilir) yeniden dene.
                    disconnectTimer = window.setTimeout(() => {
                        disconnectTimer = null;
                        if (pc.iceConnectionState === 'disconnected') tryIceRestart();
                    }, 5000);
                } else if (state === 'failed') {
                    if (await tryIceRestart()) return;
                    // Restart'i karsi taraf yapiyor olabilir; biraz bekle, duzelmediyse uyar.
                    if (issueTimer) clearTimeout(issueTimer);
                    issueTimer = window.setTimeout(() => {
                        issueTimer = null;
                        const s = pc.iceConnectionState;
                        if (pc.signalingState !== 'closed' && s !== 'connected' && s !== 'completed') markIssue();
                    }, 8000);
                } else if (state === 'connected' || state === 'completed') {
                    iceRestarts = 0;
                    if (issueTimer) { clearTimeout(issueTimer); issueTimer = null; }
                    setConnectionIssues(prev => {
                        if (!prev.has(targetConnectionId)) return prev;
                        const next = new Set(prev);
                        next.delete(targetConnectionId);
                        return next;
                    });
                }
            };

            return pc;
        };

        const setupWebRTCListeners = () => {
            const handleUserJoined = async (_joinedUsername: string, connectionId: string) => {
                const pc = createPeerConnection(connectionId);
                peerConnections.current.set(connectionId, pc);
                try {
                    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
                    await pc.setLocalDescription(offer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connectionId);
                } catch (e) {
                    console.error('[WebRTC] Offer hatası:', e);
                }
            };

            const handleUserLeft = (_: string, connectionId: string) => {
                peerConnections.current.get(connectionId)?.close();
                peerConnections.current.delete(connectionId);
                iceCandidateQueues.current.delete(connectionId);
                remoteTracks.current.delete(connectionId);
                
                const analyserData = analyserRefs.current.get(connectionId);
                if (analyserData) {
                    clearInterval(analyserData.interval);
                    analyserRefs.current.delete(connectionId);
                }
                setSpeakingUsers(prev => {
                    const next = new Set(prev);
                    next.delete(connectionId);
                    return next;
                });

                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(connectionId);
                    return newMap;
                });
            };

            const handleReceiveSignal = async (senderConnectionId: string, signalDataStr: string) => {
                const signalData = JSON.parse(signalDataStr);
                let pc = peerConnections.current.get(senderConnectionId);
                if (!pc) {
                    pc = createPeerConnection(senderConnectionId);
                    peerConnections.current.set(senderConnectionId, pc);
                }
                try {
                    if (signalData.type === 'offer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                        
                        const queue = iceCandidateQueues.current.get(senderConnectionId);
                        if (queue && queue.length > 0) {
                            for (const candidate of queue) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            iceCandidateQueues.current.set(senderConnectionId, []);
                        }

                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'answer', sdp: answer }), senderConnectionId);
                    } else if (signalData.type === 'answer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));

                        const queue = iceCandidateQueues.current.get(senderConnectionId);
                        if (queue && queue.length > 0) {
                            for (const candidate of queue) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            iceCandidateQueues.current.set(senderConnectionId, []);
                        }
                    } else if (signalData.type === 'ice') {
                        if (pc.remoteDescription) {
                            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                        } else {
                            const queue = iceCandidateQueues.current.get(senderConnectionId) || [];
                            queue.push(signalData.candidate);
                            iceCandidateQueues.current.set(senderConnectionId, queue);
                        }
                    } else if (signalData.type === 'screen-stopped' || signalData.type === 'camera-stopped') {
                        // Yedek temizlik: karşı taraf track'i kaldırınca bizdeki kopyası "muted"
                        // olur. Yalnızca onları at — ekran kapanırken kamera (ya da tersi) ve
                        // mikrofon kalsın. Yeniden anlaşma geç gelebilir, bir kez daha bak.
                        const prune = () => {
                            const set = remoteTracks.current.get(senderConnectionId);
                            if (!set) return;
                            const first = [...set].find(t => t.kind === 'audio');
                            let changed = false;
                            set.forEach(t => {
                                if (t !== first && (t.muted || t.readyState === 'ended')) { set.delete(t); changed = true; }
                            });
                            if (changed) {
                                const live = [...set].filter(t => t.readyState === 'live');
                                setRemoteStreams(prev => {
                                    const newMap = new Map(prev);
                                    if (live.length > 0) newMap.set(senderConnectionId, new MediaStream(live));
                                    else newMap.delete(senderConnectionId);
                                    return newMap;
                                });
                            }
                        };
                        prune();
                        setTimeout(prune, 1500);
                    }
                } catch (e) {
                    console.error(`[WebRTC] Sinyal hatası (${signalData.type}):`, e);
                }
            };

            // Hub yeniden baglandi: connectionId'miz degisti ve sunucu digerlerine
            // eski baglantimiz icin UserLeft gonderdi. Eski peer'lar artik olu;
            // hepsini kapat. Odaya geri girince digerleri yeni baglantiya offer acar.
            const handleReconnected = () => {
                peerConnections.current.forEach(pc => pc.close());
                peerConnections.current.clear();
                iceCandidateQueues.current.clear();
                remoteTracks.current.clear();
                analyserRefs.current.forEach(a => clearInterval(a.interval));
                analyserRefs.current.clear();
                setRemoteStreams(new Map());
                setSpeakingUsers(new Set());
                setConnectionIssues(new Set());
            };

            signalrService.onUserJoined(handleUserJoined);
            signalrService.onUserLeft(handleUserLeft);
            signalrService.onReceiveSignal(handleReceiveSignal);
            signalrService.onReconnected(handleReconnected);

            return () => {
                signalrService.offUserJoined(handleUserJoined);
                signalrService.offUserLeft(handleUserLeft);
                signalrService.offReceiveSignal(handleReceiveSignal);
                signalrService.offReconnected(handleReconnected);
            };
        };

        const init = async () => {
            // Önce mikrofon izni al, sonra cihazları listele (izin olmadan isimler boş döner)
            const opened = await openMicStream();
            if (!isMounted) {
                opened?.gate.destroy();
                opened?.raw.getTracks().forEach(t => t.stop());
                return;
            }
            if (opened) {
                rawStreamRef.current = opened.raw;
                gateRef.current = opened.gate;
                streamRef.current = opened.processed;
                setLocalStream(opened.processed);
            }
            await loadDevices();
            const cleanup = setupWebRTCListeners();
            setIsReady(true);
            return cleanup;
        };

        let cleanupListeners: (() => void) | undefined;
        init().then(cleanup => { if (cleanup) cleanupListeners = cleanup; });

        const currentPCs = peerConnections.current;
        return () => {
            isMounted = false;
            cleanupListeners?.();
            gateRef.current?.destroy();
            gateRef.current = null;
            streamRef.current?.getTracks().forEach(t => t.stop());
            // Ham stream ayrica durdurulmali — mikrofon isigi ancak boyle soner.
            rawStreamRef.current?.getTracks().forEach(t => t.stop());
            rawStreamRef.current = null;
            videoStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            currentPCs.forEach(pc => pc.close());
            currentPCs.clear();
            remoteTracks.current.clear();
            setRemoteStreams(new Map());
        };
    }, []);

    // Ayarlardan mikrofon degisince canli stream'i degistir. init() ilk stream'i
    // zaten dogru cihazla actigi icin mount'ta calismamali.
    const appliedMicRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isReady) return;
        if (appliedMicRef.current === null) { appliedMicRef.current = selectedMicId; return; }
        if (appliedMicRef.current === selectedMicId) return;
        appliedMicRef.current = selectedMicId;

        let cancelled = false;
        (async () => {
            const opened = await openMicStream(selectedMicId);
            if (!opened) return;
            if (cancelled) {
                opened.gate.destroy();
                opened.raw.getTracks().forEach(t => t.stop());
                return;
            }

            const newAudioTrack = opened.processed.getAudioTracks()[0];
            // Mikrofon kapaliysa yeni track'te de kapali kalsin.
            const wasEnabled = streamRef.current?.getAudioTracks()[0]?.enabled ?? true;
            if (newAudioTrack) newAudioTrack.enabled = wasEnabled;

            peerConnections.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                if (sender && newAudioTrack) sender.replaceTrack(newAudioTrack).catch(e => console.error('[WebRTC] replaceTrack hatasi:', e));
            });

            gateRef.current?.destroy();
            streamRef.current?.getTracks().forEach(t => t.stop());
            rawStreamRef.current?.getTracks().forEach(t => t.stop());

            gateRef.current = opened.gate;
            streamRef.current = opened.processed;
            rawStreamRef.current = opened.raw;
            setLocalStream(opened.processed);
            setIsMuted(!wasEnabled);
        })();

        return () => { cancelled = true; };
    }, [selectedMicId, isReady, openMicStream]);

    // Tarayici gurultu filtresi degisince canli stream'e uygula.
    // Kisit HAM track'e uygulanmali — islenmis stream MediaStreamDestination'dan
    // gelir ve mikrofon kisitlarini tasimaz.
    useEffect(() => {
        if (!isReady) return;
        const track = rawStreamRef.current?.getAudioTracks()[0];
        if (track) {
            track.applyConstraints({
                noiseSuppression: noiseSuppression ? { ideal: true } : { ideal: false },
                echoCancellation: noiseSuppression ? { ideal: true } : { ideal: false },
                autoGainControl: noiseSuppression ? { ideal: true } : { ideal: false }
            }).catch(e => console.error('[WebRTC] applyConstraints failed:', e));
        }
    }, [noiseSuppression, localStream, isReady]);

    // Kapi ayarlari degisince calisan kapiya canli uygula — stream yeniden
    // acilmaz, ses kesilmez. Ayni anda bir sonraki kapinin baslangic degerini
    // de guncelle.
    useEffect(() => {
        gateSettingsRef.current = {
            enabled: settings.noiseGateEnabled,
            threshold: settings.noiseGateThreshold,
        };
        gateRef.current?.setEnabled(settings.noiseGateEnabled);
        gateRef.current?.setThreshold(settings.noiseGateThreshold);
    }, [settings.noiseGateEnabled, settings.noiseGateThreshold]);

    // Anlık mikrofon seviyesi (0-100) — oda içi gürültü kapısı kaydırıcısının
    // canlı çubuğu için. Aktif kapının analizörünü okur, ek stream açmaz.
    // Bir peer ile baglanti kalici olarak koptugunda sesli uyar — aksi halde
    // kullanici karsi tarafi duymadigini fark etmiyordu.
    const prevIssueCountRef = useRef(0);
    useEffect(() => {
        if (connectionIssues.size > prevIssueCountRef.current) playConnectionLostSound();
        prevIssueCountRef.current = connectionIssues.size;
    }, [connectionIssues]);

    const getMicLevel = useCallback(() => gateRef.current?.getLevel() ?? 0, []);

    const toggleMute = useCallback(() => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    }, []);

    // Mikrofonu doğrudan aç/kapat (bas-konuş için — toggle değil, kesin durum)
    const setMicEnabled = useCallback((enabled: boolean) => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = enabled;
                setIsMuted(!enabled);
            }
        }
    }, []);

    return {
        localStream,
        localVideoStream,
        screenStream,
        remoteStreams,
        isMuted,
        isCameraOn,
        isScreenSharing,
        toggleMute,
        setMicEnabled,
        getMicLevel,
        toggleCamera,
        toggleScreenShare,
        switchMicrophone,
        audioInputs,
        audioOutputs,
        selectedMicId,
        selectedOutputId,
        setSelectedOutputId,
        isReady,
        speakingUsers,
        connectionIssues,
    };
}
