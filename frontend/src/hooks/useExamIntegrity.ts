import { useEffect, useRef } from 'react';

/**
 * Watches a solo technical assessment for leaving the page, clipboard use,
 * and camera loss. Reports events. Never throws into the exam.
 */
export function useExamIntegrity(options: {
  enabled: boolean;
  stream: MediaStream | null;
  onEvent: (type: string, message: string) => void;
}) {
  const { enabled, stream, onEvent } = options;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const lastRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;

    const report = (type: string, message: string) => {
      const now = Date.now();
      if (now - (lastRef.current[type] ?? 0) < 4000) return;
      lastRef.current[type] = now;
      onEventRef.current(type, message);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        report('tab_hidden', 'Candidate left the assessment tab.');
      } else {
        report('tab_visible', 'Candidate returned to the assessment tab.');
      }
    };

    const blockClipboard = (type: string, message: string) => (event: Event) => {
      event.preventDefault();
      report(type, message);
    };

    const onCopy = blockClipboard('copy_blocked', 'Copy was blocked.');
    const onCut = blockClipboard('cut_blocked', 'Cut was blocked.');
    const onPaste = blockClipboard('paste_blocked', 'Paste was blocked.');
    const onContext = (event: Event) => {
      event.preventDefault();
      report('context_menu_blocked', 'Right-click was blocked.');
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        report('print_blocked', 'Print was blocked.');
      }
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        report('fullscreen_exited', 'Candidate left fullscreen.');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);

    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const onEnded = () => {
      onEventRef.current(
        'camera_interrupted',
        'The candidate camera stopped during the assessment.',
      );
    };
    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [enabled, stream]);
}
