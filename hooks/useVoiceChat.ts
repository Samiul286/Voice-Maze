'use client';

import { useEffect, useRef, useState } from 'react';

export function useVoiceChat(socket: any, lobbyId: string, players: any) {
    const [peers, setPeers] = useState<any>({});
    const [isMuted, setIsMuted] = useState(false);
    const peersRef = useRef<any>({});
    const audioRefs = useRef<any>({});
    const userStream = useRef<any>(null);

    useEffect(() => {
        if (!socket || typeof window === 'undefined') return;

        let Peer: any;

        const initVoice = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.error('getUserMedia is not supported');
                    return;
                }

                const SimplePeer = (await import('simple-peer')).default;
                Peer = SimplePeer;

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                userStream.current = stream;

                socket.on('user-joined-voice', (userId: string) => {
                    if (peersRef.current[userId]) return;
                    const peer = createPeer(userId, socket.id, stream, Peer);
                    peersRef.current[userId] = peer;
                    setPeers((prev: any) => ({ ...prev, [userId]: peer }));
                });

                socket.on('voice-signal', ({ from, signal }: any) => {
                    if (peersRef.current[from]) {
                        peersRef.current[from].signal(signal);
                    } else {
                        const peer = addPeer(signal, from, stream, Peer);
                        peersRef.current[from] = peer;
                        setPeers((prev: any) => ({ ...prev, [from]: peer }));
                    }
                });
            } catch (err) {
                console.error("Voice chat initialization failed:", err);
            }
        };

        initVoice();

        return () => {
            userStream.current?.getTracks().forEach((track: any) => track.stop());
            Object.values(peersRef.current).forEach((peer: any) => peer.destroy());
            Object.values(audioRefs.current).forEach((audio: any) => {
                audio.pause();
                audio.srcObject = null;
            });
        };
    }, [socket, lobbyId]);

    // Apply volume priority when players/roles change
    useEffect(() => {
        Object.keys(audioRefs.current).forEach(userId => {
            const player = players[userId];
            const audio = audioRefs.current[userId];
            if (player && audio) {
                // Leader's voice is louder
                audio.volume = player.role === 'leader' ? 1.0 : 0.4;
            }
        });
    }, [players]);

    const toggleMic = () => {
        if (userStream.current) {
            const audioTrack = userStream.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    function createPeer(userToSignal: string, callerId: string, stream: any, Peer: any) {
        const peer = new Peer({ initiator: true, trickle: false, stream });
        setupPeerEvents(peer, userToSignal, callerId);
        return peer;
    }

    function addPeer(incomingSignal: any, callerId: string, stream: any, Peer: any) {
        const peer = new Peer({ initiator: false, trickle: false, stream });
        setupPeerEvents(peer, callerId, socket.id);
        peer.signal(incomingSignal);
        return peer;
    }

    function setupPeerEvents(peer: any, targetId: string, fromId: string) {
        peer.on('signal', (signal: any) => {
            socket.emit('voice-signal', { to: targetId, from: fromId, signal });
        });

        peer.on('stream', (stream: any) => {
            const audio = new Audio();
            audio.srcObject = stream;
            audio.autoplay = true;
            // Initial volume based on role
            const player = players[targetId];
            audio.volume = player?.role === 'leader' ? 1.0 : 0.4;
            audioRefs.current[targetId] = audio;
            audio.play().catch(e => console.error("Audio play failed:", e));
        });

        peer.on('close', () => {
            if (audioRefs.current[targetId]) {
                audioRefs.current[targetId].pause();
                audioRefs.current[targetId].srcObject = null;
                delete audioRefs.current[targetId];
            }
            delete peersRef.current[targetId];
            setPeers((prev: any) => {
                const newPeers = { ...prev };
                delete newPeers[targetId];
                return newPeers;
            });
        });
    }

    return { peers, isMuted, toggleMic };
}

