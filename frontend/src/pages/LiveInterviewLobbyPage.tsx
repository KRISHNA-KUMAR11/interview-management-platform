import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { liveInterviewApi } from '../lib/api';
import { guestSession } from '../lib/guestSession';
import type { LiveInterviewSession } from '../types/liveInterview';

export function LiveInterviewLobbyPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user: authUser, hasPermission } = useAuth();
  const guestUser = guestSession.getUser();
  const user = authUser ?? guestUser;
  const isGuest = Boolean(guestSession.isActiveFor(id));
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [session, setSession] = useState<LiveInterviewSession | null>(null);
  const [error, setError] = useState('');
  const [cameraOk, setCameraOk] = useState(false);
  const [microphoneOk, setMicrophoneOk] = useState(false);
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const response = await liveInterviewApi.get(id);
      setSession(response.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interview.');
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('completed')
      ) {
        guestSession.clear();
      }
    }
  };

  useEffect(() => {
    void load();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [id]);

  useEffect(() => {
    if (!isGuest) return;
    const timer = window.setInterval(() => {
      void liveInterviewApi.get(id).catch((err) => {
        const message = err instanceof Error ? err.message : '';
        if (/closed|cancel|completed|expired|no longer/i.test(message)) {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          setError(
            'This interview was ended. The invite link is no longer valid.',
          );
          setSession(null);
        }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id, isGuest]);

  const runMediaCheck = async () => {
    setChecking(true);
    setError('');
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const nextCamera = Boolean(videoTrack && videoTrack.readyState === 'live');
      const nextMic = Boolean(audioTrack && audioTrack.readyState === 'live');
      setCameraOk(nextCamera);
      setMicrophoneOk(nextMic);

      await liveInterviewApi.join(id);
      await liveInterviewApi.mediaCheck(id, nextCamera, nextMic);
      await load();
    } catch (err) {
      setCameraOk(false);
      setMicrophoneOk(false);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to access camera or microphone.',
      );
    } finally {
      setChecking(false);
    }
  };

  const enterRoom = async () => {
    if (!cameraOk || !microphoneOk) {
      setError('Pass camera and microphone check before entering the room.');
      return;
    }
    setJoining(true);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      await liveInterviewApi.join(id);
      navigate(`/live-interview/${id}/room`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter room.');
    } finally {
      setJoining(false);
    }
  };

  if (!session && !error) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Loading lobby…</div>
      </div>
    );
  }

  if (!session) {
    const inviteClosed = /closed|cancel|completed|expired|no longer/i.test(
      error,
    );
    return (
      <section className="page live-lobby">
        <div className="alert">{error}</div>
        {inviteClosed ? (
          <p className="lede">You can close this window.</p>
        ) : !isGuest ? (
          <Link to="/live-interview">Back to live interviews</Link>
        ) : null}
      </section>
    );
  }

  const me = session.participants.find((p) => p.user.id === user?.userId);
  const canControl =
    !isGuest &&
    (user?.userId === session.interview.interviewer.id ||
      hasPermission('Interview.Create'));

  const joinUrl = session.inviteToken
    ? `${window.location.origin}/join/${session.inviteToken}`
    : session.candidateJoinUrl;

  const copyCandidateLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copy manually: ${joinUrl}`);
    }
  };

  return (
    <section className="page live-lobby">
      <header className="page-header">
        <div>
          <p className="eyebrow">Lobby · Room {session.roomCode}</p>
          <h1>{session.interview.title}</h1>
          <p className="lede">
            Oral video call. {session.interview.candidate.firstName}{' '}
            {session.interview.candidate.lastName} meets{' '}
            {session.interview.interviewer.firstName}{' '}
            {session.interview.interviewer.lastName}. Other participants can
            join the same room.
          </p>
        </div>
        <Link
          className="ghost-btn"
          to={isGuest ? `/join/${session.inviteToken}` : '/live-interview'}
          onClick={() => {
            if (isGuest) guestSession.clear();
          }}
        >
          {isGuest ? 'Leave invite' : 'Back'}
        </Link>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <div className="lobby-grid">
        <div className="preview-panel">
          <video ref={videoRef} autoPlay muted playsInline className="preview-video" />
          <div className="check-row">
            <span className={cameraOk ? 'ok' : 'bad'}>
              Camera {cameraOk ? 'ready' : 'not ready'}
            </span>
            <span className={microphoneOk ? 'ok' : 'bad'}>
              Microphone {microphoneOk ? 'ready' : 'not ready'}
            </span>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void runMediaCheck()}
            disabled={checking}
          >
            {checking ? 'Checking devices…' : 'Check camera & microphone'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void enterRoom()}
            disabled={joining || !cameraOk || !microphoneOk}
          >
            {joining ? 'Entering…' : 'Enter interview room'}
          </button>
        </div>

        <aside className="lobby-side">
          <h2>Session details</h2>
          <ul className="detail-list">
            <li>
              <strong>Status</strong>
              <span>{session.interview.status.replace('_', ' ')}</span>
            </li>
            <li>
              <strong>Opens</strong>
              <span>
                {new Date(session.interview.scheduledAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </li>
            <li>
              <strong>Closes</strong>
              <span>
                {new Date(session.interview.endsAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </li>
            <li>
              <strong>Recording</strong>
              <span>
                {session.recordingEnabled
                  ? 'Interviewer records the call'
                  : 'Not recorded'}
              </span>
            </li>
            <li>
              <strong>Your role</strong>
              <span>{me?.role ?? 'Not joined yet'}</span>
            </li>
          </ul>

          {canControl && joinUrl ? (
            <div className="share-row">
              <label className="share-label">Candidate invite link</label>
              <div className="share-controls">
                <input
                  readOnly
                  value={joinUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void copyCandidateLink()}
                >
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>
          ) : null}

          <h3>Participants</h3>
          <ul className="participant-list">
            {session.participants.map((participant) => (
              <li key={participant.id}>
                <strong>
                  {participant.user.firstName} {participant.user.lastName}
                </strong>
                <span>
                  {participant.role}
                  {participant.mediaCheckPassed ? ' · media OK' : ''}
                </span>
              </li>
            ))}
          </ul>

          {canControl && session.interview.status === 'COMPLETED' ? (
            <p className="lede">This interview is completed.</p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
