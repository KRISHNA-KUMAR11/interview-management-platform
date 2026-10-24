import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { liveInterviewApi } from '../lib/api';
import { tokenStorage } from '../lib/tokenStorage';
import type { LiveInterviewReview } from '../types/liveInterview';

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function AuthedVideo({
  liveInterviewId,
  recordingId,
  label,
}: {
  liveInterviewId: string;
  recordingId: string;
  label: string;
}) {
  const [src, setSrc] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    const load = async () => {
      try {
        const url = liveInterviewApi.recordingStreamUrl(
          liveInterviewId,
          recordingId,
        );
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${tokenStorage.getAccessToken() ?? ''}`,
          },
        });
        if (!response.ok) {
          throw new Error('Unable to load recording.');
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Playback failed.');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [liveInterviewId, recordingId]);

  if (error) {
    return <div className="alert">{error}</div>;
  }

  if (!src) {
    return <div className="boot-card">Loading recording…</div>;
  }

  return (
    <figure className="review-player">
      <video src={src} controls playsInline />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function LiveInterviewReviewPage() {
  const { id = '' } = useParams();
  const [review, setReview] = useState<LiveInterviewReview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await liveInterviewApi.review(id);
        setReview(response.data ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load review.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  if (loading) {
    return <div className="boot-card">Loading interview review…</div>;
  }

  if (error || !review) {
    return (
      <section className="page">
        <div className="alert">{error || 'Review not found.'}</div>
        <Link to="/live-interview">Back to live interviews</Link>
      </section>
    );
  }

  return (
    <section className="page review-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Completed interview</p>
          <h1>{review.interview.title}</h1>
          <p className="lede">
            {review.interview.candidate.firstName}{' '}
            {review.interview.candidate.lastName} with{' '}
            {review.interview.interviewer.firstName}{' '}
            {review.interview.interviewer.lastName}
          </p>
        </div>
        <Link className="ghost-btn" to="/live-interview">
          Back
        </Link>
      </header>

      <div className="review-grid">
        <div className="review-main">
          <h2>Audio & video</h2>
          <p className="lede">
            The conversation file shows everyone in the call side by side. The
            candidate file is their own camera.
          </p>
          {review.recordings.length === 0 ? (
            <p className="lede">
              No conversation recording was saved. The interviewer records the
              oral call when recording is enabled. Start and complete an
              interview with camera/mic enabled to capture A/V.
            </p>
          ) : (
            review.recordings.map((recording) => (
              <AuthedVideo
                key={recording.id}
                liveInterviewId={review.id}
                recordingId={recording.id}
                label={`${recording.label} · ${recording.durationSeconds ?? '?'}s · ${Math.round(recording.sizeBytes / 1024)} KB`}
              />
            ))
          )}
        </div>

        <aside className="review-side">
          <div className="lobby-side">
            <h2>Session details</h2>
            <ul className="detail-list">
              <li>
                <strong>Status</strong>
                <span>{review.interview.status.replace('_', ' ')}</span>
              </li>
              <li>
                <strong>Scheduled</strong>
                <span>{formatWhen(review.interview.scheduledAt)}</span>
              </li>
              <li>
                <strong>Started</strong>
                <span>
                  {review.startedAt ? formatWhen(review.startedAt) : '—'}
                </span>
              </li>
              <li>
                <strong>Ended</strong>
                <span>{review.endedAt ? formatWhen(review.endedAt) : '—'}</span>
              </li>
              <li>
                <strong>Room</strong>
                <span>{review.roomCode}</span>
              </li>
            </ul>

            <h3>Participants</h3>
            <ul className="participant-list">
              {review.participants.map((participant) => (
                <li key={participant.id}>
                  <strong>
                    {participant.user.firstName} {participant.user.lastName}
                  </strong>
                  <span>{participant.role}</span>
                </li>
              ))}
            </ul>

            <h3>Feedback</h3>
            {review.interview.feedback.length === 0 ? (
              <p className="lede">No feedback submitted.</p>
            ) : (
              <ul className="feedback-list">
                {review.interview.feedback.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.submittedBy.firstName} {item.submittedBy.lastName}
                    </strong>
                    <span>
                      Rating {item.rating}/5 · {item.recommendation.replace('_', ' ')}
                    </span>
                    {item.strengths ? <p>Strengths: {item.strengths}</p> : null}
                    {item.weaknesses ? <p>Weaknesses: {item.weaknesses}</p> : null}
                    {item.comments ? <p>{item.comments}</p> : null}
                  </li>
                ))}
              </ul>
            )}

            <h3>Timeline</h3>
            {review.events.length === 0 ? (
              <p className="lede">No events logged.</p>
            ) : (
              <ul className="timeline-list">
                {review.events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.eventType.replace(/_/g, ' ')}</strong>
                    <span>{formatWhen(event.createdAt)}</span>
                    {event.message ? <p>{event.message}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
