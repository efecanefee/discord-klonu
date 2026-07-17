import { useState, useRef, useCallback, useEffect } from 'react';
import signalrService, { type VoiceUser } from '../services/signalrService';
import { useSettings } from '../contexts/SettingsContext';
import { getRtcConfig } from '../config/webrtc';
import { createNoiseGate, type NoiseGate } from '../utils/noiseGate';

export type VoiceParticipant = VoiceUser;

/**
 * Ses kanalı için sade (yalnızca ses) WebRTC mesh hook'u.
 * Sinyalleşme mevcut SendSignalToUser/ReceiveSignal ile; peer keşfi ise
 * metin presence'ından bağımsız VoiceParticipants/VoiceUserJoined/VoiceUserLeft ile yapılır.
 * Kural (glare önleme): mevcut katılımcılar yeni gelene offer açar; yeni gelen yalnızca yanıtlar.
 */
export function useVoiceChannel() {
    const { settings } = useSettings();
    const [activeVoiceKey, setActiveVoiceKey] = useState<string | null>(null);
    const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [speakingConnIds, setSpeakingConnIds] = useState<Set<string>>(new Set());
    const [isMuted, setIsMuted] = useState(false);
    // ICE'i kalici olarak basarisiz olan peer'lar — UI'da uyari gostermek icin.
    const [connectionIssues, setConnectionIssues] = useState<Set<string>>(new Set());

    // localStreamRef = peer'lara giden islenmis stream (kapidan gecmis).
    // rawStreamRef = getUserMedia'dan gelen ham stream; yalnizca stop() icin
    // tutulur, yoksa mikrofon isigi sonmez.
    const localStreamRef = useRef<MediaStream | null>(null);
    const rawStreamRef = useRef<MediaStream | null>(null);
    const gateRef = useRef<NoiseGate | null>(null);
    const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
    const iceQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const analysers = useRef<Map<string, { ctx: AudioContext; interval: number }>>(new Map());
    const activeKeyRef = useRef<string | null>(null);
    const selfRef = useRef<VoiceUser | null>(null);
    const noiseSuppression = settings.noiseSuppression;
    const microphoneId = settings.microphoneId;

    // Yeni kapi olustururken baslangic degerleri buradan okunur. Ref, cunku
    // openMic'in kimligi ayar degisince degismemeli (yoksa mikrofon yeniden acilir).
    const gateSettingsRef = useRef({
        enabled: settings.noiseGateEnabled,
        threshold: settings.noiseGateThreshold,
    });

    // Ayarlardaki mikrofonla stream ac ('default' ise secimi tarayiciya birak),
    // ardindan gurultu kapisindan gecir. Donen stream peer'lara gonderilir.
    const openMic = useCallback(async (): Promise<{ raw: MediaStream; processed: MediaStream; gate: NoiseGate }> => {
        const raw = await navigator.mediaDevices.getUserMedia({
            audio: {
                ...(microphoneId && microphoneId !== 'default' ? { deviceId: { exact: microphoneId } } : {}),
                noiseSuppression: { ideal: noiseSuppression },
                echoCancellation: { ideal: noiseSuppression },
                autoGainControl: { ideal: noiseSuppression },
            },
            video: false,
        });
        const gate = createNoiseGate(raw, gateSettingsRef.current);
        return { raw, processed: gate.stream, gate };
    }, [microphoneId, noiseSuppression]);

    const cleanupAnalyser = (connId: string) => {
        const a = analysers.current.get(connId);
        if (a) { clearInterval(a.interval); a.ctx.close().catch(() => { }); analysers.current.delete(connId); }
    };

    const attachAnalyser = (connId: string, track: MediaStreamTrack) => {
        try {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(new MediaStream([track]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            const interval = window.setInterval(() => {
                analyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                setSpeakingConnIds(prev => {
                    const next = new Set(prev);
                    if (avg > 8) next.add(connId); else next.delete(connId);
                    return next;
                });
            }, 120);
            analysers.current.set(connId, { ctx, interval });
        } catch (e) { console.error('[Voice] Analyser hatası:', e); }
    };

    const createPeerConnection = useCallback((connId: string) => {
        const pc = new RTCPeerConnection(getRtcConfig());
        iceQueues.current.set(connId, []);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
        }
        pc.onicecandidate = e => {
            if (e.candidate) signalrService.sendSignalToUser(JSON.stringify({ type: 'ice', candidate: e.candidate }), connId);
        };
        pc.ontrack = e => {
            const [stream] = e.streams;
            setRemoteStreams(prev => new Map(prev).set(connId, stream));
            if (e.track.kind === 'audio') attachAnalyser(connId, e.track);
        };

        let iceRestarted = false;
        pc.oniceconnectionstatechange = async () => {
            const state = pc.iceConnectionState;
            console.log(`[Voice ICE] ${connId} -> ${state}`);

            if (state === 'failed') {
                // Glare onleme: yalnizca connectionId'si buyuk olan taraf restart eder.
                const myId = signalrService.connectionId ?? '';
                if (!iceRestarted && myId > connId) {
                    iceRestarted = true;
                    console.warn(`[Voice ICE] ${connId} basarisiz, ICE restart deneniyor.`);
                    try {
                        const offer = await pc.createOffer({ iceRestart: true });
                        await pc.setLocalDescription(offer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connId);
                    } catch (err) {
                        console.error('[Voice] ICE restart hatasi:', err);
                        setConnectionIssues(prev => new Set(prev).add(connId));
                    }
                } else {
                    setConnectionIssues(prev => new Set(prev).add(connId));
                }
            } else if (state === 'connected' || state === 'completed') {
                iceRestarted = false;
                setConnectionIssues(prev => {
                    if (!prev.has(connId)) return prev;
                    const next = new Set(prev);
                    next.delete(connId);
                    return next;
                });
            }
        };

        return pc;
    }, []);

    // ---- sinyal & presence handler'ları (join'de kaydedilir) ----
    const handlersRef = useRef<{
        onParticipants: (vk: string, users: VoiceUser[]) => void;
        onJoined: (vk: string, user: VoiceUser) => void;
        onLeft: (vk: string, connId: string) => void;
        onSignal: (senderConnId: string, dataStr: string) => Promise<void>;
    } | null>(null);

    const closePeer = (connId: string) => {
        pcs.current.get(connId)?.close();
        pcs.current.delete(connId);
        iceQueues.current.delete(connId);
        cleanupAnalyser(connId);
        setRemoteStreams(prev => { const m = new Map(prev); m.delete(connId); return m; });
        setSpeakingConnIds(prev => { const s = new Set(prev); s.delete(connId); return s; });
        setConnectionIssues(prev => { const s = new Set(prev); s.delete(connId); return s; });
    };

    const teardown = useCallback(() => {
        const h = handlersRef.current;
        if (h) {
            signalrService.offVoiceParticipants(h.onParticipants);
            signalrService.offVoiceUserJoined(h.onJoined);
            signalrService.offVoiceUserLeft(h.onLeft);
            signalrService.offReceiveSignal(h.onSignal);
            handlersRef.current = null;
        }
        pcs.current.forEach(pc => pc.close());
        pcs.current.clear();
        iceQueues.current.clear();
        analysers.current.forEach(a => { clearInterval(a.interval); a.ctx.close().catch(() => { }); });
        analysers.current.clear();
        gateRef.current?.destroy();
        gateRef.current = null;
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        // Ham stream ayrica durdurulmali — mikrofon isigi ancak boyle soner.
        rawStreamRef.current?.getTracks().forEach(t => t.stop());
        rawStreamRef.current = null;
        setRemoteStreams(new Map());
        setSpeakingConnIds(new Set());
        setConnectionIssues(new Set());
        setParticipants([]);
    }, []);

    const leaveVoice = useCallback(() => {
        const key = activeKeyRef.current;
        if (!key) return;
        signalrService.leaveVoice(key);
        teardown();
        activeKeyRef.current = null;
        selfRef.current = null;
        setActiveVoiceKey(null);
        setIsMuted(false);
    }, [teardown]);

    const joinVoice = useCallback(async (voiceKey: string, self: VoiceUser) => {
        if (activeKeyRef.current === voiceKey) return;
        if (activeKeyRef.current) leaveVoice();

        // Mikrofon aç (gürültü kapısından geçmiş stream peer'lara gider)
        try {
            const { raw, processed, gate } = await openMic();
            rawStreamRef.current = raw;
            localStreamRef.current = processed;
            gateRef.current = gate;
        } catch (e) {
            console.error('[Voice] Mikrofon açılamadı:', e);
            alert('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
            return;
        }
        setIsMuted(false);

        const onParticipants = (vk: string, users: VoiceUser[]) => {
            if (vk !== activeKeyRef.current) return;
            // Ben yeni gelenim → mevcutlar bana offer açacak; sadece UI listesini kur
            setParticipants([self, ...users.filter(u => u.connectionId !== self.connectionId)]);
        };
        const onJoined = async (vk: string, user: VoiceUser) => {
            if (vk !== activeKeyRef.current || user.connectionId === self.connectionId) return;
            setParticipants(prev => prev.some(p => p.connectionId === user.connectionId) ? prev : [...prev, user]);
            // Ben mevcut üyeyim → yeni gelene offer aç
            const pc = createPeerConnection(user.connectionId);
            pcs.current.set(user.connectionId, pc);
            try {
                const offer = await pc.createOffer({ offerToReceiveAudio: true });
                await pc.setLocalDescription(offer);
                signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), user.connectionId);
            } catch (e) { console.error('[Voice] Offer hatası:', e); }
        };
        const onLeft = (vk: string, connId: string) => {
            if (vk !== activeKeyRef.current) return;
            closePeer(connId);
            setParticipants(prev => prev.filter(p => p.connectionId !== connId));
        };
        const onSignal = async (senderConnId: string, dataStr: string) => {
            let data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
            try { data = JSON.parse(dataStr); } catch { return; }
            let pc = pcs.current.get(senderConnId);
            if (!pc) { pc = createPeerConnection(senderConnId); pcs.current.set(senderConnId, pc); }
            try {
                if (data.type === 'offer' && data.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const q = iceQueues.current.get(senderConnId);
                    if (q?.length) { for (const c of q) await pc.addIceCandidate(new RTCIceCandidate(c)); iceQueues.current.set(senderConnId, []); }
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'answer', sdp: answer }), senderConnId);
                } else if (data.type === 'answer' && data.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const q = iceQueues.current.get(senderConnId);
                    if (q?.length) { for (const c of q) await pc.addIceCandidate(new RTCIceCandidate(c)); iceQueues.current.set(senderConnId, []); }
                } else if (data.type === 'ice' && data.candidate) {
                    if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    else { const q = iceQueues.current.get(senderConnId) || []; q.push(data.candidate); iceQueues.current.set(senderConnId, q); }
                }
            } catch (e) { console.error('[Voice] Sinyal hatası:', e); }
        };

        handlersRef.current = { onParticipants, onJoined, onLeft, onSignal };
        signalrService.onVoiceParticipants(onParticipants);
        signalrService.onVoiceUserJoined(onJoined);
        signalrService.onVoiceUserLeft(onLeft);
        signalrService.onReceiveSignal(onSignal);

        activeKeyRef.current = voiceKey;
        selfRef.current = self;
        setActiveVoiceKey(voiceKey);
        setParticipants([self]);
        await signalrService.joinVoice(voiceKey);
    }, [openMic, createPeerConnection, leaveVoice]);

    // Ayarlardan mikrofon degisirse: yeni stream ac, tum peer'larda track'i
    // degistir, eskisini durdur. Baglanti kopmaz, karsi taraf kesinti duymaz.
    useEffect(() => {
        if (!activeKeyRef.current || !localStreamRef.current) return;

        let cancelled = false;
        (async () => {
            let opened: { raw: MediaStream; processed: MediaStream; gate: NoiseGate };
            try {
                opened = await openMic();
            } catch (e) {
                console.error('[Voice] Mikrofon degistirilemedi:', e);
                return;
            }
            if (cancelled || !activeKeyRef.current) {
                opened.gate.destroy();
                opened.raw.getTracks().forEach(t => t.stop());
                return;
            }

            const newTrack = opened.processed.getAudioTracks()[0];
            // Mikrofon kapaliysa yeni track'te de kapali kalsin.
            const wasEnabled = localStreamRef.current?.getAudioTracks()[0]?.enabled ?? true;
            if (newTrack) newTrack.enabled = wasEnabled;

            pcs.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                if (sender && newTrack) sender.replaceTrack(newTrack).catch(e => console.error('[Voice] replaceTrack hatasi:', e));
            });

            gateRef.current?.destroy();
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            rawStreamRef.current?.getTracks().forEach(t => t.stop());

            gateRef.current = opened.gate;
            localStreamRef.current = opened.processed;
            rawStreamRef.current = opened.raw;
        })();

        return () => { cancelled = true; };
    }, [openMic]);

    // Kapi ayarlari degisince calisan kapiya canli uygula — stream'i yeniden
    // acmaya gerek yok, boylece ses kesilmez. Bir sonraki kapinin baslangic
    // degeri de burada guncellenir.
    useEffect(() => {
        gateSettingsRef.current = {
            enabled: settings.noiseGateEnabled,
            threshold: settings.noiseGateThreshold,
        };
        gateRef.current?.setEnabled(settings.noiseGateEnabled);
        gateRef.current?.setThreshold(settings.noiseGateThreshold);
    }, [settings.noiseGateEnabled, settings.noiseGateThreshold]);

    const toggleMute = useCallback(() => {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
    }, []);

    // Bileşen unmount olursa ses kanalından çık
    useEffect(() => () => { if (activeKeyRef.current) { signalrService.leaveVoice(activeKeyRef.current); teardown(); } }, [teardown]);

    return { activeVoiceKey, participants, remoteStreams, speakingConnIds, connectionIssues, isMuted, toggleMute, joinVoice, leaveVoice };
}
