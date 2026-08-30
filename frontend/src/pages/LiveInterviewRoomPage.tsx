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
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
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

  const canFeedback = !isGuest && hasPermission('Interview.Feedback');
  const canRecord = !isGuest && hasPermission('LiveInterview.Record');
  const canControl =
    !isGuest &&
    (user?.userId === session?.interview.interviewer.id ||
      hasPermission('Interview.Create'));

  const endGuestAccess = useCallback(
    (inviteToken?: string | null) => {
      const token = inviteToken ?? session?.inviteToken ?? '';
      localStream?.getTracks().forEach((track) => track.stop());
      guestSession.clear();
      navigate(token ? `/join/${token}` : '/login', { replace: true });
    },
    [localStream, navigate, session?.inviteToken],
  );

  const onRemoteSessionEvent = useCallback(
    (type: string) => {
      if (type === 'completed' && isGuest) {
        endGuestAccess();
      }
    },
    [endGuestAccess, isGuest],
  );

  const { remoteStreams, connectionLabel, emitSessionEvent } = useLiveRoom({
    enabled: Boolean(localStream && session),
    roomCode: session?.roomCode ?? '',
    liveInterviewId: id,
    localStream,
    onSessionEvent: onRemoteSessionEvent,
  });

  const recordingActive =
    session?.interview.status === 'IN_PROGRESS' && Boolean(localStream);

  const { stop: stopRecorder } = useSessionRecorder({
    active: recordingActive,
    localStream,
    remoteStreams,
  });

  const refresh = async () => {
    const response = await liveInterviewApi.get(id);
    setSession(response.data ?? null);
  };

  const saveRecordingToDb = async () => {
    const { blob, durationSeconds } = await stopRecorder();
    if (!blob || blob.size < 1000) return;
    await liveInterviewApi.uploadRecording(id, blob, {
      label: `${user?.firstName ?? 'Participant'} session recording`,
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
        await liveInterviewApi.logEvent(id, 'joined_room', 'Entered interview room');
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to open room.');
        }
      }
    };

    void boot();

    return () => {
      active = false;
      void liveInterviewApi.leave(id);
    };
  }, [id]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream]);

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

  const onToggleRecording = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const next = !session.isRecording;
      const response = await liveInterviewApi.toggleRecording(id, next);
      setSession(response.data ?? null);
      emitSessionEvent(next ? 'recording-started' : 'recording-stopped');
      await liveInterviewApi.logEvent(
        id,
        next ? 'recording_started' : 'recording_stopped',
        next ? 'Recording marked on' : 'Recording marked off',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording toggle failed.');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    setBusy(true);
    setError('');
    try {
      try {
        await saveRecordingToDb();
      } catch (uploadErr) {
        console.error(uploadErr);
        setError(
          uploadErr instanceof Error
            ? `Interview completed but recording upload failed: ${uploadErr.message}`
            : 'Recording upload failed.',
        );
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
      if (session?.interview.status === 'IN_PROGRESS' || recordingActive) {
        try {
          await saveRecordingToDb();
        } catch {
          // still allow leave
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
            {session.roomCode} · {session.interview.status.replace('_', ' ')} ·{' '}
            {connectionLabel}
            {recordingActive ? ' · SAVING A/V' : ''}
            {session.isRecording ? ' · REC' : ''}
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
          {canControl &&
          canRecord &&
          session.recordingEnabled &&
          session.interview.status === 'IN_PROGRESS' ? (
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => void onToggleRecording()}
            >
              {session.isRecording ? 'Stop recording flag' : 'Start recording flag'}
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
                ? 'Waiting for the interviewer to join…'
                : 'Waiting for the other participant…'}
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
