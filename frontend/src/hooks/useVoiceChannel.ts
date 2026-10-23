import { useState, useRef, useCallback, useEffect } from 'react';
import signalrService, { type VoiceUser } from '../services/signalrService';
import { useSettings } from '../contexts/SettingsContext';
import { getRtcConfig } from '../config/webrtc';
import { createNoiseGate, type NoiseGate } from '../utils/noiseGate';
import { playConnectionLostSound, playSelfLeaveSound } from '../utils/sound';
import { voiceControls, useVoiceControls } from '../utils/voiceControls';
import { createSerialQueue, isPolite, watchPeerHealth } from '../utils/rtcRecovery';

// Kopan bir peer icin ust uste en fazla kac ICE restart denenir
const MAX_ICE_RESTARTS = 3;

export type VoiceParticipant = VoiceUser;

/**
 * Ses kanalı için sade (yalnızca ses) WebRTC mesh hook'u.
 * Sinyalleşme mevcut SendSignalToUser/ReceiveSignal ile; peer keşfi ise
 * metin presence'ından bağımsız VoiceParticipants/VoiceUserJoined/VoiceUserLeft ile yapılır.
 * Kural (glare önleme): mevcut katılımcılar yeni gelene offer açar; yeni gelen yalnızca yanıtlar.
 * Sonradan iki taraf aynı anda offer açarsa (ICE restart) kibar/kaba kuralı devreye girer.
 */
export function useVoiceChannel() {
    const { settings } = useSettings();
    const [activeVoiceKey, setActiveVoiceKey] = useState<string | null>(null);
    const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [speakingConnIds, setSpeakingConnIds] = useState<Set<string>>(new Set());
    // Sustur / sağırlaştır lobideki kullanıcı kartıyla ortak; sağırken mikrofon da kapalı
    const { micBlocked: isMuted, deafened } = useVoiceControls();
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
    // Peer basina sinyaller sirayla islenir (eskiden ayni anda islenip ICE adaylari kayboluyordu)
    const [signalQueue] = useState(createSerialQueue);
    // Kaba tarafin cakismada yok saydigi offer'in ICE adaylari hata verir; sessizce gec
    const ignoredOffers = useRef<Set<string>>(new Set());
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

    // Peer'a offer ac (ilk baglanti, ICE restart). Sinyal kuyruguna girer.
    const sendOffer = useCallback((pc: RTCPeerConnection, connId: string, opts?: RTCOfferOptions) =>
        signalQueue.run(connId, async () => {
            if (pc.signalingState === 'closed' || pcs.current.get(connId) !== pc) return;
            try {
                const offer = await pc.createOffer({ offerToReceiveAudio: true, ...opts });
                await pc.setLocalDescription(offer);
                signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connId);
            } catch (e) { console.error('[Voice] Offer hatası:', e); }
        }), [signalQueue]);

    // Son care kurtarma icin (createPeerConnection'dan once tanimlanamiyor, ref ile cagrilir)
    const rebuildPeerRef = useRef<(connId: string) => void>(() => { });

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

        let iceRestarts = 0;
        let disconnectTimer: number | null = null;
        let issueTimer: number | null = null;
        const markIssue = () => setConnectionIssues(prev => prev.has(connId) ? prev : new Set(prev).add(connId));
        // Kopan peer icin ICE restart. Iki taraf ayni anda denerse cakisma sinyal
        // handler'indaki kibar/kaba kuraliyla cozulur; bu yuzden iki taraf da dener.
        const tryIceRestart = (): boolean => {
            if (pc.signalingState === 'closed' || iceRestarts >= MAX_ICE_RESTARTS) return false;
            iceRestarts++;
            console.warn(`[Voice ICE] ${connId} kopuk, ICE restart deneniyor (${iceRestarts}/${MAX_ICE_RESTARTS}).`);
            sendOffer(pc, connId, { iceRestart: true });
            return true;
        };
        pc.oniceconnectionstatechange = async () => {
            const state = pc.iceConnectionState;
            console.log(`[Voice ICE] ${connId} -> ${state}`);
            if (disconnectTimer && state !== 'disconnected') { clearTimeout(disconnectTimer); disconnectTimer = null; }

            if (state === 'disconnected') {
                // Kisa ag dalgalanmasinda kendiliginden duzelir; 5 sn surerse
                // 'failed'i beklemeden (bu 30 sn'yi bulabilir) yeniden dene.
                disconnectTimer = window.setTimeout(() => {
                    disconnectTimer = null;
                    if (pc.iceConnectionState === 'disconnected') tryIceRestart();
                }, 5000);
            } else if (state === 'failed') {
                if (tryIceRestart()) return;
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
                    if (!prev.has(connId)) return prev;
                    const next = new Set(prev);
                    next.delete(connId);
                    return next;
                });
            }
        };

        // Takilan peer'i otomatik kurtar: once ICE restart, olmazsa sifirdan kur
        watchPeerHealth(pc, (_reason, attempt) => {
            if (attempt < 3) { sendOffer(pc, connId, { iceRestart: true }); return; }
            // Iki taraf ayni anda sifirdan kurmasin: yalnizca kaba taraf kurar, kibar taraf ister.
            if (isPolite(signalrService.connectionId, connId)) {
                signalrService.sendSignalToUser(JSON.stringify({ type: 'reset-request' }), connId);
            } else {
                rebuildPeerRef.current(connId);
            }
        });

        return pc;
    }, [sendOffer]);

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
        ignoredOffers.current.delete(connId);
        cleanupAnalyser(connId);
        setRemoteStreams(prev => { const m = new Map(prev); m.delete(connId); return m; });
        setSpeakingConnIds(prev => { const s = new Set(prev); s.delete(connId); return s; });
        setConnectionIssues(prev => { const s = new Set(prev); s.delete(connId); return s; });
    };

    // Son care: eski peer'i at, yenisini kur ve offer ac. Karsi taraf 'reset'
    // ile eski peer'ini kapatir, gelen offer'la yenisini kurar.
    rebuildPeerRef.current = (connId: string) => {
        signalQueue.run(connId, async () => {
            if (!pcs.current.has(connId)) return;
            console.warn(`[Voice] ${connId} baglantisi sifirdan kuruluyor.`);
            signalrService.sendSignalToUser(JSON.stringify({ type: 'reset' }), connId);
            closePeer(connId);
            const pc = createPeerConnection(connId);
            pcs.current.set(connId, pc);
            sendOffer(pc, connId);
        });
    };

    const drainIceQueue = async (connId: string, pc: RTCPeerConnection) => {
        // Once kuyrugu al, sonra bosalt: dongu sirasinda gelen aday kaybolmasin
        const q = iceQueues.current.get(connId) ?? [];
        iceQueues.current.set(connId, []);
        for (const c of q) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { console.warn('[Voice] Bekleyen ICE adayi eklenemedi:', e); }
        }
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
        signalQueue.clear();
        ignoredOffers.current.clear();
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
    }, [signalQueue]);

    const leaveVoice = useCallback(() => {
        const key = activeKeyRef.current;
        if (!key) return;
        signalrService.leaveVoice(key);
        teardown();
        playSelfLeaveSound();
        activeKeyRef.current = null;
        selfRef.current = null;
        setActiveVoiceKey(null);
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
        const micTrack = localStreamRef.current?.getAudioTracks()[0];
        const vc = voiceControls.get();
        if (micTrack) micTrack.enabled = !vc.micMuted && !vc.deafened;

        const onParticipants = (vk: string, users: VoiceUser[]) => {
            if (vk !== activeKeyRef.current) return;
            // Ben yeni gelenim → mevcutlar bana offer açacak; sadece UI listesini kur
            const me = selfRef.current ?? self;
            setParticipants([me, ...users.filter(u => u.connectionId !== me.connectionId)]);
        };
        const onJoined = async (vk: string, user: VoiceUser) => {
            if (vk !== activeKeyRef.current || user.connectionId === (selfRef.current ?? self).connectionId) return;
            setParticipants(prev => prev.some(p => p.connectionId === user.connectionId) ? prev : [...prev, user]);
            // Ben mevcut üyeyim → yeni gelene offer aç (aynı bağlantıdan eski peer kaldıysa temizle)
            if (pcs.current.has(user.connectionId)) closePeer(user.connectionId);
            const pc = createPeerConnection(user.connectionId);
            pcs.current.set(user.connectionId, pc);
            sendOffer(pc, user.connectionId);
        };
        const onLeft = (vk: string, connId: string) => {
            if (vk !== activeKeyRef.current) return;
            closePeer(connId);
            signalQueue.delete(connId);
            setParticipants(prev => prev.filter(p => p.connectionId !== connId));
        };
        const processSignal = async (senderConnId: string, data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
            if (data.type === 'reset') { closePeer(senderConnId); return; }
            if (data.type === 'reset-request') {
                if (!isPolite(signalrService.connectionId, senderConnId)) rebuildPeerRef.current(senderConnId);
                return;
            }
            let pc = pcs.current.get(senderConnId);
            if (!pc) {
                // Bilinmeyen peer'dan offer dışı sinyal: ölü bir bağlantıdan kalmıştır
                if (data.type !== 'offer') return;
                pc = createPeerConnection(senderConnId);
                pcs.current.set(senderConnId, pc);
            }
            try {
                if (data.type === 'offer' && data.sdp) {
                    // Perfect negotiation: biz de offer açmışken offer gelirse çakışma var
                    const collision = pc.signalingState !== 'stable';
                    if (collision && !isPolite(signalrService.connectionId, senderConnId)) {
                        ignoredOffers.current.add(senderConnId);
                        return;
                    }
                    ignoredOffers.current.delete(senderConnId);
                    if (collision) await pc.setLocalDescription({ type: 'rollback' });
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    await drainIceQueue(senderConnId, pc);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'answer', sdp: answer }), senderConnId);
                } else if (data.type === 'answer' && data.sdp) {
                    // Beklediğimiz bir offer yoksa bu eski/yinelenen bir yanıttır
                    if (pc.signalingState !== 'have-local-offer') return;
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    await drainIceQueue(senderConnId, pc);
                } else if (data.type === 'ice' && data.candidate) {
                    if (pc.remoteDescription) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
                        catch (e) { if (!ignoredOffers.current.has(senderConnId)) throw e; }
                    } else {
                        const q = iceQueues.current.get(senderConnId) || [];
                        q.push(data.candidate);
                        iceQueues.current.set(senderConnId, q);
                    }
                }
            } catch (e) { console.error('[Voice] Sinyal hatası:', e); }
        };
        const onSignal = async (senderConnId: string, dataStr: string) => {
            let data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
            try { data = JSON.parse(dataStr); } catch { return; }
            await signalQueue.run(senderConnId, () => processSignal(senderConnId, data));
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
    }, [openMic, createPeerConnection, leaveVoice, sendOffer, signalQueue]);

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

    // Sustur/sağırlaştır değişince (oda içinden veya lobiden) mikrofona uygula
    useEffect(() => {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) track.enabled = !isMuted;
    }, [isMuted]);

    const toggleMute = voiceControls.toggleMic;

    // Hub yeniden baglandi: connectionId'miz degisti, sunucu bizi ses kanalindan
    // cikardi. Mikrofonu acik tutup eski peer'lari kapat; signalrService ardindan
    // JoinVoice'u tekrar cagirir ve digerleri yeni baglantiya offer acar.
    useEffect(() => {
        const onReconnected = (newId: string) => {
            if (!activeKeyRef.current || !selfRef.current) return;
            pcs.current.forEach(pc => pc.close());
            pcs.current.clear();
            iceQueues.current.clear();
            signalQueue.clear();
            ignoredOffers.current.clear();
            analysers.current.forEach(a => { clearInterval(a.interval); a.ctx.close().catch(() => { }); });
            analysers.current.clear();
            setRemoteStreams(new Map());
            setSpeakingConnIds(new Set());
            setConnectionIssues(new Set());
            selfRef.current = { ...selfRef.current, connectionId: newId };
            setParticipants([selfRef.current]);
        };
        signalrService.onReconnected(onReconnected);
        return () => signalrService.offReconnected(onReconnected);
    }, [signalQueue]);

    // Bir peer ile baglanti kalici olarak koptugunda sesli uyar
    const prevIssueCountRef = useRef(0);
    useEffect(() => {
        if (connectionIssues.size > prevIssueCountRef.current) playConnectionLostSound();
        prevIssueCountRef.current = connectionIssues.size;
    }, [connectionIssues]);

    // Bileşen unmount olursa ses kanalından çık
    useEffect(() => () => { if (activeKeyRef.current) { signalrService.leaveVoice(activeKeyRef.current); teardown(); playSelfLeaveSound(); } }, [teardown]);

    // Ping ölçümü için mevcut peer bağlantıları (ref — kimliği sabit)
    const getPeers = useCallback(() => pcs.current, []);

    return { getPeers, activeVoiceKey, participants, remoteStreams, speakingConnIds, connectionIssues, isMuted, deafened, toggleMute, toggleDeafen: voiceControls.toggleDeafen, joinVoice, leaveVoice };
}
