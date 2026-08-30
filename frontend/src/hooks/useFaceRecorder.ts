import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Continuous webcam (+ mic) recording for technical assessment proctoring.
 * Camera access is required; call enableCamera() before startRecording().
 */
export function useFaceRecorder() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const enableCamera = useCallback(async () => {
    setCameraError('');
    try {
      stopTracks();
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = media;
      setStream(media);
      return media;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Camera access is required to take this assessment.';
      setCameraError(
        message.includes('Permission') || message.includes('NotAllowed')
          ? 'Camera permission was denied. Allow the camera and try again.'
          : 'Unable to access your camera. Check that it is connected and not in use.',
      );
      throw err;
    }
  }, [stopTracks]);

  const startRecording = useCallback(() => {
    const media = streamRef.current;
    if (!media || recorderRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    const recorder = new MediaRecorder(media, {
      mimeType,
      videoBitsPerSecond: 1_000_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setRecording(true);
  }, []);

  const stopRecording = useCallback(async (): Promise<{
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
    setRecording(false);
    return { blob, durationSeconds };
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
      stopTracks();
    };
  }, [stopTracks]);

  return {
    stream,
    cameraError,
    recording,
    enableCamera,
    startRecording,
    stopRecording,
    stopTracks,
  };
}
