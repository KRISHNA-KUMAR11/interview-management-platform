import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { liveInterviewApi } from '../lib/api';
import { guestSession } from '../lib/guestSession';
import type { InvitePreview } from '../types/liveInterview';

export function CandidateJoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await liveInterviewApi.invitePreview(token);
        setInvite(response.data ?? null);
      } catch (err) {
        guestSession.clear();
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

  const joinWithoutLogin = async () => {
    setJoining(true);
    setError('');
    try {
      const response = await liveInterviewApi.enterAsGuest(token);
      if (!response.data) {
        throw new Error('Unable to join interview.');
      }
      guestSession.set(
        response.data.accessToken,
        response.data.liveInterviewId,
        {
          ...response.data.user,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          isGuest: true,
          liveInterviewId: response.data.liveInterviewId,
        },
      );
      navigate(response.data.lobbyPath, { replace: true });
    } catch (err) {
      guestSession.clear();
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
        <div className="boot-card">Opening your interview invite…</div>
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
      error.toLowerCase().includes('completed');
    return (
      <div className="auth-page single">
        <div className="auth-form card">
          <h2>
            {early
              ? 'Interview not open yet'
              : expired
                ? 'Invite unavailable'
                : 'Invite unavailable'}
          </h2>
          <p className="lede">
            {error ||
              'This interview link is invalid or the interview has ended.'}
          </p>
          {expired && !early ? (
            <p className="lede">
              Once an interview is completed or the window ends, candidates can
              no longer use this link.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page single">
      <div className="auth-form card">
        <p className="eyebrow">Interview invitation</p>
        <h2>{invite.interview.title}</h2>
        <p className="lede">
          Hi {invite.interview.candidate.firstName}, you are invited to a live
          interview with {invite.interview.interviewer.firstName}{' '}
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
        </ul>

        <p className="lede">
          Click below to check your camera and join.
        </p>
        <button
          type="button"
          className="primary-btn"
          disabled={joining}
          onClick={() => void joinWithoutLogin()}
        >
          {joining ? 'Joining…' : 'Join interview'}
        </button>
      </div>
    </div>
  );
}
