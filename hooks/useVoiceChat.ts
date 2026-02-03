'use client';

import { useEffect, useRef, useState } from 'react';

export function useVoiceChat(socket: any, lobbyId: string) {
    const [peers, setPeers] = useState({});
    const peersRef = useRef<any>({});
    const userStream = useRef<any>(null);

    useEffect(() => {
        if (!socket || typeof window === 'undefined') return;

        let Peer: any;

        const initVoice = async () => {
            try {
                // Check if mediaDevices API is available
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.error('getUserMedia is not supported in this browser/context');
                    console.warn('Voice chat requires HTTPS or localhost');
                    return;
                }

                // Dynamic import to avoid SSR issues with simple-peer
                const SimplePeer = (await import('simple-peer')).default;
                Peer = SimplePeer;

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                userStream.current = stream;

                socket.on('user-joined-voice', (userId: string) => {
                    const peer = createPeer(userId, socket.id, stream, Peer);
                    peersRef.current[userId] = peer;
                    setPeers(prev => ({ ...prev, [userId]: peer }));
                });

                socket.on('voice-signal', ({ from, signal }: any) => {
                    if (peersRef.current[from]) {
                        peersRef.current[from].signal(signal);
                    } else {
                        const peer = addPeer(signal, from, stream, Peer);
                        peersRef.current[from] = peer;
                        setPeers(prev => ({ ...prev, [from]: peer }));
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
        };
    }, [socket, lobbyId]);

    function createPeer(userToSignal: string, callerId: string, stream: any, Peer: any) {
        const peer = new Peer({ initiator: true, trickle: false, stream });
        peer.on('signal', (signal: any) => {
            socket.emit('voice-signal', { to: userToSignal, from: callerId, signal });
        });
        return peer;
    }

    function addPeer(incomingSignal: any, callerId: string, stream: any, Peer: any) {
        const peer = new Peer({ initiator: false, trickle: false, stream });
        peer.on('signal', (signal: any) => {
            socket.emit('voice-signal', { to: callerId, from: socket.id, signal });
        });
        peer.signal(incomingSignal);
        return peer;
    }

    return { peers };
}

