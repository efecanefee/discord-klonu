import { useState, useRef, useCallback, useEffect } from 'react';
import signalrService, { type VoiceUser } from '../services/signalrService';
import { useSettings } from '../contexts/SettingsContext';

const STUN_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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

    const localStreamRef = useRef<MediaStream | null>(null);
    const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
    const iceQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const analysers = useRef<Map<string, { ctx: AudioContext; interval: number }>>(new Map());
    const activeKeyRef = useRef<string | null>(null);
    const selfRef = useRef<VoiceUser | null>(null);
    const noiseSuppression = settings.noiseSuppression;

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
        const pc = new RTCPeerConnection(STUN_SERVERS);
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
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setRemoteStreams(new Map());
        setSpeakingConnIds(new Set());
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

        // Mikrofon aç
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    noiseSuppression: { ideal: noiseSuppression },
                    echoCancellation: { ideal: noiseSuppression },
                    autoGainControl: { ideal: noiseSuppression },
                },
                video: false,
            });
        } catch (e) {
            console.error('[Voice] Mikrofon açılamadı:', e);
            alert('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
            return;
        }
        localStreamRef.current = stream;
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
    }, [noiseSuppression, createPeerConnection, leaveVoice]);

    const toggleMute = useCallback(() => {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
    }, []);

    // Bileşen unmount olursa ses kanalından çık
    useEffect(() => () => { if (activeKeyRef.current) { signalrService.leaveVoice(activeKeyRef.current); teardown(); } }, [teardown]);

    return { activeVoiceKey, participants, remoteStreams, speakingConnIds, isMuted, toggleMute, joinVoice, leaveVoice };
}
