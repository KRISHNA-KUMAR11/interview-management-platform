import { useCallback, useEffect, useRef } from 'react';

interface RemoteStream {
  socketId: string;
  stream: MediaStream;
  label: string;
}

function pickMimeType(stream: MediaStream) {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return types.find(
    (type) =>
      MediaRecorder.isTypeSupported(type) &&
      stream.getTracks().length > 0,
  );
}

/**
 * Records the oral interview from the host's point of view: local video plus
 * every participant who joins later, with mixed audio. The candidate does not
 * use this hook. start() never throws.
 */
export function useSessionRecorder(options: {
  active: boolean;
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  /** gallery draws every on-screen tile. camera records only the local camera. */
  capture?: 'gallery' | 'camera';
}) {
  const { active, localStream, remoteStreams, capture = 'gallery' } = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const connectedAudioRef = useRef<Set<string>>(new Set());
  const clonedAudioRef = useRef<MediaStreamTrack[]>([]);
  const remoteRef = useRef(remoteStreams);
  const stopPromiseRef = useRef<Promise<{
    blob: Blob | null;
    durationSeconds: number;
  }> | null>(null);
  remoteRef.current = remoteStreams;

  const stopDrawLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  };

  const cleanupStreams = () => {
    stopDrawLoop();
    mixedStreamRef.current?.getTracks().forEach((track) => track.stop());
    mixedStreamRef.current = null;
    connectedAudioRef.current.clear();
    clonedAudioRef.current.forEach((track) => track.stop());
    clonedAudioRef.current = [];
    audioDestRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  };

  const attachAudio = (key: string, stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    const dest = audioDestRef.current;
    if (!ctx || !dest || connectedAudioRef.current.has(key)) return;
    const clones = stream
      .getAudioTracks()
      .filter((track) => track.readyState === 'live')
      .map((track) => track.clone());
    if (clones.length === 0) return;
    try {
      const source = ctx.createMediaStreamSource(new MediaStream(clones));
      source.connect(dest);
      clonedAudioRef.current.push(...clones);
      connectedAudioRef.current.add(key);
    } catch {
      clones.forEach((track) => track.stop());
      // A missing microphone should not stop the oral recording.
    }
  };

  const syncAudio = useCallback((local: MediaStream) => {
    attachAudio('local', local);
    for (const remote of remoteRef.current) {
      attachAudio(remote.socketId, remote.stream);
    }
  }, []);

  const beginRecorder = (mixed: MediaStream, ownsTracks: boolean) => {
    if (ownsTracks) mixedStreamRef.current = mixed;
    let recorder: MediaRecorder;
    try {
      const mimeType = pickMimeType(mixed);
      recorder = mimeType
        ? new MediaRecorder(mixed, {
            mimeType,
            videoBitsPerSecond: 1_500_000,
          })
        : new MediaRecorder(mixed);
    } catch {
      cleanupStreams();
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    try {
      recorder.start(1000);
    } catch {
      cleanupStreams();
      return;
    }
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
  };

  const start = useCallback(() => {
    if (!localStream || recorderRef.current) return;

    if (captureRef.current === 'camera') {
      const camera = new MediaStream();
      localStream.getVideoTracks().forEach((track) => camera.addTrack(track));
      localStream.getAudioTracks().forEach((track) => camera.addTrack(track));
      beginRecorder(camera, false);
      return;
    }

    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    void audioCtx.resume().catch(() => undefined);
    const audioDest = audioCtx.createMediaStreamDestination();
    audioDestRef.current = audioDest;
    const canvasStream = canvas.captureStream(15);
    const mixed = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => mixed.addTrack(track));
    audioDest.stream.getAudioTracks().forEach((track) => mixed.addTrack(track));
    mixedStreamRef.current = mixed;
    if (captureRef.current === 'gallery') {
      syncAudio(localStream);
    } else {
      attachAudio('local', localStream);
    }

    const draw = () => {
      ctx.fillStyle = '#10241c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const tiles =
        captureRef.current === 'camera'
          ? []
          : Array.from(document.querySelectorAll<HTMLElement>('.live-room .video-tile'))
              .map((tile) => {
                const video = tile.querySelector('video');
                const label = tile.querySelector('span')?.textContent?.trim() ?? '';
                return video && video.videoWidth > 0 ? { video, label } : null;
              })
              .filter((tile): tile is { video: HTMLVideoElement; label: string } =>
                Boolean(tile),
              );
      if (tiles.length > 0) {
        const cols = tiles.length > 1 ? 2 : 1;
        const rows = Math.ceil(tiles.length / cols);
        const tileW = canvas.width / cols;
        const tileH = canvas.height / rows;
        tiles.forEach((tile, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * tileW;
          const y = row * tileH;
          const scale = Math.max(
            tileW / tile.video.videoWidth,
            tileH / tile.video.videoHeight,
          );
          const dw = tile.video.videoWidth * scale;
          const dh = tile.video.videoHeight * scale;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, tileW, tileH);
          ctx.clip();
          ctx.drawImage(tile.video, x + (tileW - dw) / 2, y + (tileH - dh) / 2, dw, dh);
          ctx.restore();
          if (tile.label) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(x + 16, y + tileH - 52, Math.min(tileW - 32, 420), 36);
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px sans-serif';
            ctx.fillText(tile.label, x + 28, y + tileH - 28, tileW - 56);
          }
        });
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    if (captureRef.current === 'gallery') draw();
    beginRecorder(mixed, true);
  }, [localStream, syncAudio]);

  const stop = useCallback(async (): Promise<{
    blob: Blob | null;
    durationSeconds: number;
  }> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;

    const recorder = recorderRef.current;
    if (!recorder) {
      return { blob: null, durationSeconds: 0 };
    }

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - startedAtRef.current) / 1000),
    );

    const promise = new Promise<{
      blob: Blob | null;
      durationSeconds: number;
    }>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'video/webm';
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type })
            : null;
        chunksRef.current = [];
        recorderRef.current = null;
        cleanupStreams();
        resolve({ blob, durationSeconds });
      };
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          recorderRef.current = null;
          cleanupStreams();
          resolve({ blob: null, durationSeconds });
        }
      } catch {
        recorderRef.current = null;
        cleanupStreams();
        resolve({ blob: null, durationSeconds });
      }
    });

    stopPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      stopPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (recorderRef.current && localStream && captureRef.current === 'gallery') {
      syncAudio(localStream);
    }
  }, [localStream, remoteStreams, syncAudio]);

  useEffect(() => {
    if (active && localStream) start();
    return () => {
      if (recorderRef.current && !stopPromiseRef.current) {
        void stop();
      }
    };
  }, [active, localStream, start, stop]);

  return { stop };
}
