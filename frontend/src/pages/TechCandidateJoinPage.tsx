import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { technicalInterviewApi } from '../lib/api';
import { techGuestSession } from '../lib/techGuestSession';
import type { TechInvitePreview } from '../types/technicalInterview';

export function TechCandidateJoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<TechInvitePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await technicalInterviewApi.invitePreview(token);
        setInvite(response.data ?? null);
      } catch (err) {
        techGuestSession.clear();
        setError(
          err instanceof Error
            ? err.message
            : 'This invite link is invalid or no longer available.',
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const startWithoutLogin = async () => {
    setJoining(true);
    setError('');
    try {
      const response = await technicalInterviewApi.enterAsGuest(token);
      if (!response.data) {
        throw new Error('Unable to start assessment.');
      }
      techGuestSession.set(
        response.data.accessToken,
        response.data.technicalInterviewId,
        {
          ...response.data.user,
          isGuest: true,
          technicalInterviewId: response.data.technicalInterviewId,
        },
      );
      navigate(response.data.takePath, { replace: true });
    } catch (err) {
      techGuestSession.clear();
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to join. The link may have expired.',
      );
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Opening your assessment invite…</div>
      </div>
    );
  }

  if (error || !invite) {
    const early =
      error.toLowerCase().includes('opens at') ||
      error.toLowerCase().includes('not open');
    const expired =
      error.toLowerCase().includes('expired') ||
      error.toLowerCase().includes('closed') ||
      error.toLowerCase().includes('submitted');
    return (
      <div className="auth-page single">
        <div className="auth-form card">
          <h2>
            {early
              ? 'Assessment not open yet'
              : expired
                ? 'Invite unavailable'
                : 'Invite unavailable'}
          </h2>
          <p className="lede">
            {error ||
              'This assessment link is invalid or the window has ended.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page single">
      <div className="auth-form card">
        <p className="eyebrow">Technical assessment</p>
        <h2>{invite.interview.title}</h2>
        <p className="lede">
          Hi {invite.interview.candidate.firstName}, you are invited to complete
          a timed technical assessment with{' '}
          {invite.interview.interviewer.firstName}{' '}
          {invite.interview.interviewer.lastName}.
        </p>
        <ul className="detail-list">
          <li>
            <strong>From</strong>
            <span>
              {new Date(invite.interview.scheduledAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </li>
          <li>
            <strong>Until</strong>
            <span>
              {new Date(invite.interview.endsAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </li>
          <li>
            <strong>Time limit</strong>
            <span>{invite.timeLimitMinutes} minutes</span>
          </li>
          <li>
            <strong>Questions</strong>
            <span>
              {invite.questionCount} · {invite.maxScore} pts
            </span>
          </li>
        </ul>

        {invite.instructions ? (
          <p className="lede">{invite.instructions}</p>
        ) : (
          <p className="lede">
            Click below to start. Your timer begins when the assessment opens.
          </p>
        )}

        <button
          type="button"
          className="primary-btn"
          disabled={joining}
          onClick={() => void startWithoutLogin()}
        >
          {joining ? 'Starting…' : 'Start assessment'}
        </button>
      </div>
    </div>
  );
}
