import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { liveInterviewApi, SOCKET_BASE } from '../lib/api';
import { guestSession } from '../lib/guestSession';
import { tokenStorage } from '../lib/tokenStorage';

interface PeerInfo {
  socketId: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
}

const FALLBACK_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useLiveRoom(options: {
  enabled: boolean;
  roomCode: string;
  liveInterviewId: string;
  localStream: MediaStream | null;
  onSessionEvent?: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const { enabled, roomCode, liveInterviewId, localStream, onSessionEvent } =
    options;
  const socketRef = useRef<Socket | null>(null);
  const onSessionEventRef = useRef(onSessionEvent);
  onSessionEventRef.current = onSessionEvent;
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ socketId: string; stream: MediaStream; label: string }>
  >([]);
  const [connectionLabel, setConnectionLabel] = useState('Connecting…');

  const cleanupPeer = useCallback((socketId: string) => {
    const pc = peersRef.current.get(socketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketId);
    }
    setRemoteStreams((prev) => prev.filter((item) => item.socketId !== socketId));
  }, []);

  const createPeer = useCallback(
    async (peer: PeerInfo, isInitiator: boolean) => {
      if (!localStream || peersRef.current.has(peer.socketId)) return;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peersRef.current.set(peer.socketId, pc);

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      pc.ontrack = (event) => {
        const label =
          peer.firstName && peer.lastName
            ? `${peer.firstName} ${peer.lastName}`
            : 'Participant';
        setRemoteStreams((prev) => {
          const existing = prev.find((item) => item.socketId === peer.socketId);
          const stream =
            existing?.stream ??
            (event.streams[0]?.getTracks().length
              ? event.streams[0]
              : new MediaStream());
          if (!stream.getTracks().some((track) => track.id === event.track.id)) {
            stream.addTrack(event.track);
          }
          if (existing) {
            return prev.map((item) =>
              item.socketId === peer.socketId ? { ...item, stream, label } : item,
            );
          }
          return [...prev, { socketId: peer.socketId, stream, label }];
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('signal:ice', {
            to: peer.socketId,
            roomCode,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setConnectionLabel('Connected');
        } else if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected'
        ) {
          setConnectionLabel('Reconnecting…');
        }
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('signal:offer', {
          to: peer.socketId,
          roomCode,
          sdp: offer,
        });
      }
    },
    [localStream, roomCode],
  );

  useEffect(() => {
    if (!enabled || !roomCode || !localStream) return;

    const token = tokenStorage.getAccessToken() || guestSession.getToken();
    if (!token) return;

    let socket: Socket | null = null;
    let stopped = false;

    void liveInterviewApi
      .iceServers()
      .then((response) => {
        if (response.data && response.data.length > 0) {
          iceServersRef.current = response.data;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (stopped) return;
        socket = io(`${SOCKET_BASE}/live`, {
          auth: { token },
          transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;
        bindSocket(socket);
      });

    const bindSocket = (active: Socket) => {
      active.on('connect', () => {
        setConnectionLabel('In room');
        void active
          .emitWithAck('room:join', { roomCode, liveInterviewId })
          .then((response: { ok?: boolean; peers?: PeerInfo[] }) => {
            if (!response?.peers) return;
            response.peers.forEach((peer) => {
              void createPeer(peer, true);
            });
          });
      });

      active.on('peer:joined', (peer: PeerInfo) => {
        void createPeer(peer, false);
      });

      active.on(
        'signal:offer',
        async (payload: {
          from: string;
          sdp: RTCSessionDescriptionInit;
          user?: PeerInfo;
        }) => {
          let pc = peersRef.current.get(payload.from);
          if (!pc) {
            await createPeer(
              {
                socketId: payload.from,
                userId: payload.user?.userId,
                firstName: payload.user?.firstName,
                lastName: payload.user?.lastName,
              },
              false,
            );
            pc = peersRef.current.get(payload.from);
          }
          if (!pc) return;
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          active.emit('signal:answer', {
            to: payload.from,
            roomCode,
            sdp: answer,
          });
        },
      );

      active.on(
        'signal:answer',
        async (payload: { from: string; sdp: RTCSessionDescriptionInit }) => {
          const pc = peersRef.current.get(payload.from);
          if (!pc) return;
          await pc.setRemoteDescription(payload.sdp);
        },
      );

      active.on(
        'signal:ice',
        async (payload: { from: string; candidate: RTCIceCandidateInit }) => {
          const pc = peersRef.current.get(payload.from);
          if (!pc || !payload.candidate) return;
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {
            // ignore late candidates
          }
        },
      );

      active.on('peer:left', (payload: { socketId: string }) => {
        cleanupPeer(payload.socketId);
      });

      active.on(
        'session:event',
        (payload: { type?: string; payload?: Record<string, unknown> }) => {
          if (payload?.type) {
            onSessionEventRef.current?.(payload.type, payload.payload);
          }
        },
      );
    };

    return () => {
      stopped = true;
      socket?.emit('room:leave', { roomCode });
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setRemoteStreams([]);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [
    enabled,
    roomCode,
    liveInterviewId,
    localStream,
    createPeer,
    cleanupPeer,
  ]);

  const emitSessionEvent = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      socketRef.current?.emit('session:event', { roomCode, type, payload });
    },
    [roomCode],
  );

  return {
    remoteStreams,
    connectionLabel,
    emitSessionEvent,
    socket: socketRef,
  };
}
