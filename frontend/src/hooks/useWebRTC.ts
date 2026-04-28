import { useState, useEffect, useRef, useCallback } from 'react';
import signalrService from '../services/signalrService';

const STUN_SERVERS = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export interface DeviceInfo {
    deviceId: string;
    label: string;
}

export function useWebRTC() {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const analyserRefs = useRef<Map<string, { analyser: AnalyserNode, interval: number }>>(new Map());

    // Cihaz listesi
    const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string>('');
    const [selectedOutputId, setSelectedOutputId] = useState<string>('');

    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const streamRef = useRef<MediaStream | null>(null);
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
            if (mics.length > 0 && !selectedMicId) setSelectedMicId(mics[0].deviceId);
            if (outputs.length > 0 && !selectedOutputId) setSelectedOutputId(outputs[0].deviceId);
        } catch (e) {
            console.error('[WebRTC] Cihaz listesi alınamadı:', e);
        }
    }, [selectedMicId, selectedOutputId]);

    // Belirli mikrofon ile stream aç
    const openMicStream = useCallback(async (deviceId?: string) => {
        try {
            const constraints: MediaStreamConstraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            return stream;
        } catch (e) {
            console.error('[WebRTC] Mikrofon açılamadı:', e);
            return null;
        }
    }, []);

    // Mikrofon değiştir
    const switchMicrophone = useCallback(async (deviceId: string) => {
        setSelectedMicId(deviceId);
        const newStream = await openMicStream(deviceId);
        if (!newStream) return;

        // Mevcut peer bağlantılarındaki audio track'i değiştir
        const newAudioTrack = newStream.getAudioTracks()[0];
        peerConnections.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (sender && newAudioTrack) sender.replaceTrack(newAudioTrack);
        });

        // Eski stream'i temizle, yenisini set et
        streamRef.current?.getAudioTracks().forEach(t => t.stop());
        streamRef.current = newStream;
        setLocalStream(newStream);
        setIsMuted(false);
    }, [openMicStream]);

    // Kamera aç/kapat
    const toggleCamera = useCallback(async () => {
        if (isCameraOn) {
            // Kamerayı kapat
            videoStreamRef.current?.getTracks().forEach(t => t.stop());
            videoStreamRef.current = null;
            setLocalVideoStream(null);
            setIsCameraOn(false);

            // Peer'lardan video track'i kaldır
            peerConnections.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) pc.removeTrack(sender);
            });
        } else {
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                videoStreamRef.current = videoStream;
                setLocalVideoStream(videoStream);
                setIsCameraOn(true);

                // Peer'lara video track ekle + renegotiation
                const videoTrack = videoStream.getVideoTracks()[0];
                peerConnections.current.forEach(async (pc, connId) => {
                    pc.addTrack(videoTrack, videoStream);
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connId);
                    } catch (e) {
                        console.error('[WebRTC] Kamera renegotiation hatası:', e);
                    }
                });
            } catch (e) {
                console.error('[WebRTC] Kamera açılamadı:', e);
            }
        }
    }, [isCameraOn]);

    // Ekran paylaşımı aç/kapat
    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) {
            // Ekran paylaşımını durdur
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setScreenStream(null);
            setIsScreenSharing(false);

            // Karşı tarafa "video bitti" sinyali gönder — boş track yerine null track
            peerConnections.current.forEach(async (pc, connId) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    pc.removeTrack(sender);
                    // Renegotiation — karşı taraf stream'i temizlesin
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        signalrService.sendSignalToUser(
                            JSON.stringify({ type: 'offer', sdp: offer }),
                            connId
                        );
                    } catch (e) {
                        console.error('[WebRTC] Screen stop renegotiation hatası:', e);
                    }
                }
            });

            // Ekran paylaşımı durduğunda karşı tarafa bildir (güvenilir fallback)
            peerConnections.current.forEach((_, connId) => {
                signalrService.sendSignalToUser(
                    JSON.stringify({ type: 'screen-stopped' }),
                    connId
                );
            });
        } else {
            try {
                const display = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 30 },
                    audio: true
                });

                // Kullanıcı tarayıcıdan durdurursa
                display.getVideoTracks()[0].onended = () => {
                    screenStreamRef.current = null;
                    setScreenStream(null);
                    setIsScreenSharing(false);
                };

                screenStreamRef.current = display;
                setScreenStream(display);
                setIsScreenSharing(true);

                // Peer'lara ekran track'i ekle/değiştir + renegotiation
                const screenTrack = display.getVideoTracks()[0];
                peerConnections.current.forEach(async (pc, connId) => {
                    const existingSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (existingSender) {
                        existingSender.replaceTrack(screenTrack);
                    } else {
                        pc.addTrack(screenTrack, display);
                    }
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connId);
                    } catch (e) {
                        console.error('[WebRTC] Ekran renegotiation hatası:', e);
                    }
                });
            } catch (e) {
                console.error('[WebRTC] Ekran paylaşımı başlatılamadı:', e);
            }
        }
    }, [isScreenSharing]);

    useEffect(() => {
        let isMounted = true;

        const createPeerConnection = (targetConnectionId: string) => {
            const pc = new RTCPeerConnection(STUN_SERVERS);

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
            // Ekran track ekle (varsa)
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, screenStreamRef.current!);
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

            pc.ontrack = event => {
                const [remoteStream] = event.streams;
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.set(targetConnectionId, remoteStream);
                    return newMap;
                });

                // Her track ended olunca stream'i güncelle
                event.track.addEventListener('ended', () => {
                    setRemoteStreams(prev => {
                        const newMap = new Map(prev);
                        const stream = newMap.get(targetConnectionId);
                        if (stream) {
                            const liveTracks = stream.getTracks().filter(t => t.readyState === 'live');
                            if (liveTracks.length === 0) {
                                // Hiç canlı track kalmadı, stream'i sil
                                newMap.delete(targetConnectionId);
                            } else {
                                // Sadece video track bitti, stream'i güncelle (audio kalsın)
                                const newStream = new MediaStream(liveTracks);
                                newMap.set(targetConnectionId, newStream);
                            }
                        }
                        return newMap;
                    });
                });

                // Speaking indicator — ses analizi
                const audioCtx = new window.AudioContext();
                const source = audioCtx.createMediaStreamSource(remoteStream);
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
            };

            pc.oniceconnectionstatechange = () => {
                console.log(`[WebRTC ICE] ${targetConnectionId} -> ${pc.iceConnectionState}`);
            };

            return pc;
        };

        const setupWebRTCListeners = () => {
            const handleUserJoined = async (_joinedUsername: string, connectionId: string) => {
                const pc = createPeerConnection(connectionId);
                peerConnections.current.set(connectionId, pc);
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connectionId);
                } catch (e) {
                    console.error('[WebRTC] Offer hatası:', e);
                }
            };

            const handleUserLeft = (_: string, connectionId: string) => {
                peerConnections.current.get(connectionId)?.close();
                peerConnections.current.delete(connectionId);
                
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
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'answer', sdp: answer }), senderConnectionId);
                    } else if (signalData.type === 'answer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                    } else if (signalData.type === 'ice') {
                        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                    } else if (signalData.type === 'screen-stopped') {
                        // Karşı tarafın ekran paylaşımı durdu, stream'den video track'leri temizle
                        setRemoteStreams(prev => {
                            const newMap = new Map(prev);
                            const stream = newMap.get(senderConnectionId);
                            if (stream) {
                                const audioTracks = stream.getAudioTracks().filter(t => t.readyState === 'live');
                                if (audioTracks.length > 0) {
                                    // Sadece audio kalsın
                                    newMap.set(senderConnectionId, new MediaStream(audioTracks));
                                } else {
                                    newMap.delete(senderConnectionId);
                                }
                            }
                            return newMap;
                        });
                    }
                } catch (e) {
                    console.error(`[WebRTC] Sinyal hatası (${signalData.type}):`, e);
                }
            };

            signalrService.onUserJoined(handleUserJoined);
            signalrService.onUserLeft(handleUserLeft);
            signalrService.onReceiveSignal(handleReceiveSignal);

            return () => {
                signalrService.offUserJoined(handleUserJoined);
                signalrService.offUserLeft(handleUserLeft);
                signalrService.offReceiveSignal(handleReceiveSignal);
            };
        };

        const init = async () => {
            // Önce mikrofon izni al, sonra cihazları listele (izin olmadan isimler boş döner)
            const stream = await openMicStream();
            if (!isMounted) { stream?.getTracks().forEach(t => t.stop()); return; }
            if (stream) {
                streamRef.current = stream;
                setLocalStream(stream);
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
            streamRef.current?.getTracks().forEach(t => t.stop());
            videoStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            currentPCs.forEach(pc => pc.close());
            currentPCs.clear();
            setRemoteStreams(new Map());
        };
    }, []);

    const toggleMute = useCallback(() => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
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
    };
}
