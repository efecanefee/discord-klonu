import { useState, useEffect, useRef } from 'react';
import signalrService from '../services/signalrService';

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

export function useWebRTC() {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isMuted, setIsMuted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        let isMounted = true;

        const setupWebRTCListeners = () => {
            const handleUserJoined = async (joinedUsername: string, connectionId: string) => {
                console.log(`[WebRTC] User Joined: ${joinedUsername} (${connectionId}) - OLUŞTURULUYOR: OFFER`);
                const peerConnection = createPeerConnection(connectionId);
                peerConnections.current.set(connectionId, peerConnection);

                try {
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'offer', sdp: offer }), connectionId);
                } catch (e) {
                    console.error("[WebRTC] Offer error:", e);
                }
            };

            const handleUserLeft = (leftUsername: string, connectionId: string) => {
                console.log(`[WebRTC] User Left: ${leftUsername} (${connectionId})`);
                if (peerConnections.current.has(connectionId)) {
                    peerConnections.current.get(connectionId)?.close();
                    peerConnections.current.delete(connectionId);
                }
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(connectionId);
                    return newMap;
                });
            };

            const handleReceiveSignal = async (senderConnectionId: string, signalDataStr: string) => {
                const signalData = JSON.parse(signalDataStr);
                console.log(`[WebRTC] Sinyal Geldi: ${signalData.type} - GÖNDEREN: ${senderConnectionId}`);
                
                let peerConnection = peerConnections.current.get(senderConnectionId);
                if (!peerConnection) {
                    peerConnection = createPeerConnection(senderConnectionId);
                    peerConnections.current.set(senderConnectionId, peerConnection);
                }

                try {
                    if (signalData.type === 'offer') {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        signalrService.sendSignalToUser(JSON.stringify({ type: 'answer', sdp: answer }), senderConnectionId);
                    } else if (signalData.type === 'answer') {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                    } else if (signalData.type === 'ice') {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                    }
                } catch (e) {
                    console.error(`[WebRTC] Hata (${signalData.type}):`, e);
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

        const createPeerConnection = (targetConnectionId: string) => {
            const pc = new RTCPeerConnection(STUN_SERVERS);
            
            pc.oniceconnectionstatechange = () => {
                console.log(`[WebRTC - ICE State] Peer: ${targetConnectionId} -> ${pc.iceConnectionState}`);
            };

            pc.onconnectionstatechange = () => {
                console.log(`[WebRTC - Connection State] Peer: ${targetConnectionId} -> ${pc.connectionState}`);
            };

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, streamRef.current!);
                });
            }

            pc.onicecandidate = event => {
                if (event.candidate) {
                    signalrService.sendSignalToUser(JSON.stringify({ type: 'ice', candidate: event.candidate }), targetConnectionId);
                }
            };

            pc.ontrack = event => {
                const [remoteStream] = event.streams;
                console.log(`[WebRTC] Ses Akışı Geldi (onTrack) - PEER: ${targetConnectionId}`);
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.set(targetConnectionId, remoteStream);
                    return newMap;
                });
            };

            return pc;
        };

        const initCamera = async () => {
            try {
                console.log("[WebRTC] Mikrofon izni isteniyor...");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                console.log("[WebRTC] Mikrofon erişimi BAŞARILI!");
                if (!isMounted) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                streamRef.current = stream;
                setLocalStream(stream);
            } catch (err) {
                console.error("[WebRTC] Mikrofon izni reddedildi veya hata oluştu! Salt-okunur mod ile devam ediliyor:", err);
            }
        };

        let cleanupListeners: (() => void) | null = null;
        initCamera()
            .then(() => {
                if (isMounted) {
                    cleanupListeners = setupWebRTCListeners();
                    setIsReady(true);
                }
            });

        const currentPeerConnections = peerConnections.current;

        return () => {
            isMounted = false;
            if (cleanupListeners) cleanupListeners();
            streamRef.current?.getTracks().forEach(track => track.stop());
            currentPeerConnections.forEach(pc => pc.close());
            currentPeerConnections.clear();
            setRemoteStreams(new Map());
        };
    }, []);

    const toggleMute = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    return { localStream, remoteStreams, isMuted, toggleMute, isReady };
}
