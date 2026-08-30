import { useCallback, useEffect, useRef } from 'react';

interface RemoteStream {
  socketId: string;
  stream: MediaStream;
  label: string;
}

/**
 * Records a composite canvas of local + remote video with mixed audio.
 * Starts when `active` becomes true; call stop() to get the WebM blob.
 */
export function useSessionRecorder(options: {
  active: boolean;
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
}) {
  const { active, localStream, remoteStreams } = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const mixedStreamRef = useRef<MediaStream | null>(null);

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
  };

  const start = useCallback(() => {
    if (!localStream || recorderRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const localVideo = document.createElement('video');
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.playsInline = true;
    void localVideo.play().catch(() => undefined);

    const remoteVideos = remoteStreams.map((remote) => {
      const video = document.createElement('video');
      video.srcObject = remote.stream;
      video.muted = true;
      video.playsInline = true;
      void video.play().catch(() => undefined);
      return video;
    });

    const draw = () => {
      ctx.fillStyle = '#10241c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const tiles = [localVideo, ...remoteVideos].filter(
        (video) => video.readyState >= 2,
      );
      if (tiles.length === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const cols = tiles.length > 1 ? 2 : 1;
      const rows = Math.ceil(tiles.length / cols);
      const tileW = canvas.width / cols;
      const tileH = canvas.height / rows;

      tiles.forEach((video, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        ctx.drawImage(video, col * tileW, row * tileH, tileW, tileH);
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(15);
    const mixed = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => mixed.addTrack(track));
    localStream.getAudioTracks().forEach((track) => mixed.addTrack(track));
    remoteStreams.forEach((remote) => {
      remote.stream.getAudioTracks().forEach((track) => mixed.addTrack(track));
    });
    mixedStreamRef.current = mixed;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    const recorder = new MediaRecorder(mixed, {
      mimeType,
      videoBitsPerSecond: 1_500_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
  }, [localStream, remoteStreams]);

  const stop = useCallback(async (): Promise<{
    blob: Blob | null;
    durationSeconds: number;
  }> => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return { blob: null, durationSeconds: 0 };
    }

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - startedAtRef.current) / 1000),
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'video/webm';
        const result =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type })
            : null;
        chunksRef.current = [];
        resolve(result);
      };
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });

    recorderRef.current = null;
    cleanupStreams();
    return { blob, durationSeconds };
  }, []);

  useEffect(() => {
    if (active && localStream) {
      start();
    }
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
      cleanupStreams();
    };
    // Only (re)start when active/localStream flips; remotes update via draw loop refs is limited —
    // remotes at start time are used for mixing; sufficient for MVP archival recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, localStream]);

  return { stop };
}
