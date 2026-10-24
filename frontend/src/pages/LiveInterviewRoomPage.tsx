import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { useSessionRecorder } from '../hooks/useSessionRecorder';
import { liveInterviewApi } from '../lib/api';
import { guestSession } from '../lib/guestSession';
import type {
  HireRecommendation,
  LiveInterviewSession,
} from '../types/liveInterview';

function VideoTile({
  stream,
  label,
  muted = false,
  mirror = false,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attach = useCallback(
    (node: HTMLVideoElement | null) => {
      if (!node) return;
      node.srcObject = stream;
      void node.play().catch(() => {
        node.muted = true;
        void node.play().catch(() => undefined);
      });
      const audio = audioRef.current;
      if (!muted && audio && stream) {
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      }
    },
    [muted, stream],
  );

  return (
    <div className="video-tile">
      {muted ? null : <audio ref={audioRef} autoPlay />}
      <video
        ref={attach}
        autoPlay
        playsInline
        muted={muted}
        style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      />
      <span>{label}</span>
    </div>
  );
}

export function LiveInterviewRoomPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user: authUser, hasPermission } = useAuth();
  const guestUser = guestSession.getUser();
  const user = authUser ?? guestUser;
  const isGuest = Boolean(guestSession.isActiveFor(id));

  const [session, setSession] = useState<LiveInterviewSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(4);
  const [recommendation, setRecommendation] =
    useState<HireRecommendation>('MAYBE');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [comments, setComments] = useState('');

  const canFeedback =
    !isGuest &&
    (user?.userId === session?.interview.interviewer.id ||
      hasPermission('Interview.Feedback') ||
      hasPermission('Interview.Conduct') ||
      hasPermission('Interview.Create') ||
      user?.role === 'HR' ||
      user?.role === 'Company Admin');
  const canControl =
    !isGuest &&
    (user?.userId === session?.interview.interviewer.id ||
      hasPermission('Interview.Create') ||
      hasPermission('Interview.Conduct') ||
      user?.role === 'HR' ||
      user?.role === 'Company Admin');
  const recordsConversation = Boolean(
    session?.recordingEnabled &&
      session.interview.status === 'IN_PROGRESS' &&
      localStream &&
      canControl,
  );
  const skipLeaveRef = useRef(false);

  const endGuestAccess = useCallback(
    (inviteToken?: string | null) => {
      skipLeaveRef.current = true;
      const token = inviteToken ?? session?.inviteToken ?? '';
      localStream?.getTracks().forEach((track) => track.stop());
      guestSession.clear();
      navigate(token ? `/join/${token}` : '/login', { replace: true });
    },
    [localStream, navigate, session?.inviteToken],
  );

  const uploadCandidateCamera = useCallback(async () => {
    const { blob, durationSeconds } = await stopCandidateCameraRef.current();
    if (!blob || blob.size < 1000) return;
    await liveInterviewApi.uploadRecording(id, blob, {
      label: `Candidate · ${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      durationSeconds,
    });
  }, [id, user?.firstName, user?.lastName]);

  const onRemoteSessionEvent = useCallback(
    (type: string) => {
      if (type === 'save-recording' && isGuest) {
        void uploadCandidateCamera().catch(() => undefined);
        return;
      }
      if ((type === 'completed' || type === 'cancelled') && isGuest) {
        endGuestAccess();
        return;
      }
      if (type === 'started') {
        setSession((current) =>
          current
            ? {
                ...current,
                interview: { ...current.interview, status: 'IN_PROGRESS' },
              }
            : current,
        );
      }
      if (type === 'started' || type === 'completed') {
        void liveInterviewApi
          .get(id)
          .then((response) => setSession(response.data ?? null))
          .catch(() => undefined);
      }
    },
    [endGuestAccess, id, isGuest, uploadCandidateCamera],
  );

  const { remoteStreams, connectionLabel, emitSessionEvent } = useLiveRoom({
    enabled: Boolean(localStream && session),
    roomCode: session?.roomCode ?? '',
    liveInterviewId: id,
    localStream,
    onSessionEvent: onRemoteSessionEvent,
  });

  const recordsCandidateCamera = Boolean(
    isGuest &&
      session?.recordingEnabled &&
      session.interview.status === 'IN_PROGRESS' &&
      localStream,
  );
  const { stop: stopRecorder } = useSessionRecorder({
    active: recordsConversation,
    localStream,
    remoteStreams,
    capture: 'gallery',
  });
  const { stop: stopCandidateCamera } = useSessionRecorder({
    active: recordsCandidateCamera,
    localStream,
    remoteStreams: [],
    capture: 'camera',
  });
  const stopCandidateCameraRef = useRef(stopCandidateCamera);
  stopCandidateCameraRef.current = stopCandidateCamera;

  const refresh = async () => {
    const response = await liveInterviewApi.get(id);
    setSession(response.data ?? null);
  };

  const saveRecordingToDb = async () => {
    const { blob, durationSeconds } = await stopRecorder();
    if (!blob || blob.size < 1000) return;
    await liveInterviewApi.uploadRecording(id, blob, {
      label: `Conversation · ${user?.firstName ?? 'Interviewer'} ${user?.lastName ?? ''}`.trim(),
      durationSeconds,
    });
  };

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        await liveInterviewApi.join(id);
        const response = await liveInterviewApi.get(id);
        if (!active) return;
        setSession(response.data ?? null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setLocalStream(stream);
        await liveInterviewApi.mediaCheck(id, true, true);
        try {
          await liveInterviewApi.logEvent(
            id,
            'joined_room',
            'Entered the oral interview',
          );
        } catch {
          // Joining the call matters more than the activity log.
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to open room.');
        }
      }
    };

    void boot();

    return () => {
      active = false;
      if (!skipLeaveRef.current) {
        void liveInterviewApi.leave(id).catch(() => undefined);
      }
    };
  }, [id]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream]);

  useEffect(() => {
    if (!isGuest) return;
    const timer = window.setInterval(() => {
      void liveInterviewApi.get(id).catch((err) => {
        const message = err instanceof Error ? err.message : '';
        if (/closed|cancel|completed|expired|no longer/i.test(message)) {
          endGuestAccess();
        }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [endGuestAccess, id, isGuest]);

  const onStart = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await liveInterviewApi.start(id);
      setSession(response.data ?? null);
      emitSessionEvent('started');
      await liveInterviewApi.logEvent(id, 'started', 'Interview started');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start.');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    setBusy(true);
    setError('');
    try {
      emitSessionEvent('save-recording');
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      if (recordsConversation) {
        try {
          await saveRecordingToDb();
        } catch (uploadErr) {
          console.error(uploadErr);
          setError(
            'The interview will still be completed. The conversation recording could not be saved.',
          );
        }
      }

      const response = await liveInterviewApi.complete(id);
      setSession(response.data ?? null);
      emitSessionEvent('completed');
      if (canFeedback) {
        setShowFeedback(true);
      } else {
        localStream?.getTracks().forEach((track) => track.stop());
        navigate(`/live-interview/${id}/review`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete.');
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    setBusy(true);
    try {
      if (isGuest) {
        try {
          await uploadCandidateCamera();
        } catch {
          // Leaving the call still succeeds when the upload fails.
        }
      } else if (recordsConversation) {
        try {
          await saveRecordingToDb();
        } catch {
          // Leaving the call still succeeds when the upload fails.
        }
      }
      await liveInterviewApi.leave(id);
      if (isGuest) {
        endGuestAccess();
      } else {
        localStream?.getTracks().forEach((track) => track.stop());
        navigate('/live-interview');
      }
    } catch (err) {
      if (isGuest) {
        endGuestAccess();
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to leave.');
    } finally {
      setBusy(false);
    }
  };

  const onFeedback = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await liveInterviewApi.submitFeedback(id, {
        rating,
        recommendation,
        strengths: strengths || undefined,
        weaknesses: weaknesses || undefined,
        comments: comments || undefined,
      });
      await liveInterviewApi.logEvent(
        id,
        'feedback_submitted',
        'Feedback submitted',
      );
      await refresh();
      localStream?.getTracks().forEach((track) => track.stop());
      navigate(`/live-interview/${id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!session && !error) {
    return <div className="boot-card">Opening interview room…</div>;
  }

  if (!session) {
    return (
      <section className="page">
        <div className="alert">{error}</div>
        <Link to="/live-interview">Back</Link>
      </section>
    );
  }

  return (
    <section className="live-room">
      <header className="room-bar">
        <div>
          <strong>{session.interview.title}</strong>
          <span>
            {session.roomCode} · Oral interview ·{' '}
            {session.interview.status.replace('_', ' ')} · {connectionLabel}
            {recordsConversation ? ' · Recording conversation' : ''}
          </span>
        </div>
        <div className="room-actions">
          {canControl &&
          session.interview.status !== 'IN_PROGRESS' &&
          session.interview.status !== 'COMPLETED' ? (
            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={() => void onStart()}
            >
              Start interview
            </button>
          ) : null}
          {canControl && session.interview.status === 'IN_PROGRESS' ? (
            <button
              type="button"
              className="danger-btn"
              disabled={busy}
              onClick={() => void onComplete()}
            >
              Complete interview
            </button>
          ) : null}
          {canFeedback ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowFeedback(true)}
            >
              Feedback
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() => void onLeave()}
          >
            Leave
          </button>
        </div>
      </header>

      {error ? <div className="alert room-alert">{error}</div> : null}

      <div className="video-grid">
        <VideoTile
          stream={localStream}
          label={`You (${user?.firstName ?? 'Local'})`}
          muted
          mirror
        />
        {remoteStreams.map((remote) => (
          <VideoTile
            key={remote.socketId}
            stream={remote.stream}
            label={remote.label}
          />
        ))}
        {remoteStreams.length === 0 ? (
          <div className="video-tile placeholder">
            <span>
              {isGuest
                ? 'Waiting for HR or the interviewer to join the call…'
                : 'Waiting for the candidate or another participant…'}
            </span>
          </div>
        ) : null}
      </div>

      {showFeedback ? (
        <div className="feedback-overlay">
          <form className="feedback-form" onSubmit={(e) => void onFeedback(e)}>
            <h2>Submit feedback</h2>
            <label>
              Rating (1-5)
              <input
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Recommendation
              <select
                value={recommendation}
                onChange={(e) =>
                  setRecommendation(e.target.value as HireRecommendation)
                }
              >
                <option value="HIRE">Hire</option>
                <option value="MAYBE">Maybe</option>
                <option value="NO_HIRE">No hire</option>
              </select>
            </label>
            <label>
              Strengths
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows={2}
              />
            </label>
            <label>
              Weaknesses
              <textarea
                value={weaknesses}
                onChange={(e) => setWeaknesses(e.target.value)}
                rows={2}
              />
            </label>
            <label>
              Comments
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
              />
            </label>
            <div className="feedback-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowFeedback(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'Saving…' : 'Submit feedback'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
