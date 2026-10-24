import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { technicalInterviewApi } from '../lib/api';
import { tokenStorage } from '../lib/tokenStorage';
import type { TechnicalInterviewSession } from '../types/technicalInterview';

function AuthedFaceVideo({
  technicalInterviewId,
  recordingId,
  label,
}: {
  technicalInterviewId: string;
  recordingId: string;
  label: string;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    const load = async () => {
      try {
        const url = technicalInterviewApi.recordingStreamUrl(
          technicalInterviewId,
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
  }, [technicalInterviewId, recordingId]);

  if (error) return <div className="alert">{error}</div>;
  if (!src) return <div className="boot-card">Loading recording…</div>;

  return (
    <figure className="review-player">
      <video src={src} controls playsInline />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function TechnicalReviewPage() {
  const { id = '' } = useParams();
  const { hasPermission, user } = useAuth();

  const [session, setSession] = useState<TechnicalInterviewSession | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [gradeScores, setGradeScores] = useState<Record<string, number>>({});
  const [gradeFeedback, setGradeFeedback] = useState<Record<string, string>>(
    {},
  );
  const [gradingId, setGradingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await technicalInterviewApi.get(id);
      const data = response.data ?? null;
      setSession(data);
      if (data) {
        const scores: Record<string, number> = {};
        const feedback: Record<string, string> = {};
        for (const link of data.questions) {
          const answer = data.answers.find(
            (a) => a.questionId === link.questionId,
          );
          scores[link.questionId] = answer?.score ?? 0;
          feedback[link.questionId] = answer?.feedback ?? '';
        }
        setGradeScores(scores);
        setGradeFeedback(feedback);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const totalScore = useMemo(() => {
    if (!session) return 0;
    if (session.totalScore != null) return session.totalScore;
    return session.answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
  }, [session]);

  const onGrade = async (questionId: string, maxPoints: number) => {
    const score = gradeScores[questionId] ?? 0;
    if (score < 0 || score > maxPoints) {
      setError(`Score must be between 0 and ${maxPoints}.`);
      return;
    }
    setGradingId(questionId);
    setError('');
    setInfo('');
    try {
      const response = await technicalInterviewApi.grade(id, {
        questionId,
        score,
        feedback: gradeFeedback[questionId] || undefined,
      });
      setSession((current) => {
        const next = response.data ?? null;
        if (!next) return null;
        return {
          ...next,
          recordings: next.recordings?.length
            ? next.recordings
            : current?.recordings,
          integrityEvents: next.integrityEvents?.length
            ? next.integrityEvents
            : current?.integrityEvents,
        };
      });
      setInfo('Score saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grading failed.');
    } finally {
      setGradingId(null);
    }
  };

  if (loading) {
    return (
      <section className="page">
        <div className="boot-card">Loading review…</div>
      </section>
    );
  }

  if (error && !session) {
    return (
      <section className="page">
        <div className="alert">{error}</div>
        <Link className="ghost-btn" to="/technical-interview">
          Back
        </Link>
      </section>
    );
  }

  if (!session) return null;

  const isInterviewer = user?.userId === session.interview.interviewer.id;
  const allowGrade =
    (hasPermission('TechnicalInterview.Review') || isInterviewer) &&
    (session.attemptStatus === 'SUBMITTED' ||
      session.attemptStatus === 'REVIEWED');

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Review</p>
          <h1>{session.interview.title}</h1>
          <p className="lede">
            {session.interview.candidate.firstName}{' '}
            {session.interview.candidate.lastName} ·{' '}
            {session.attemptStatus.replace('_', ' ')}
          </p>
        </div>
        <div className="score-summary">
          <span className="meta">Total score</span>
          <strong>
            {totalScore}/{session.maxScore}
          </strong>
        </div>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {info ? <div className="alert success">{info}</div> : null}

      <section className="review-recordings">
        <h2 className="section-title">Candidate camera</h2>
        <p className="lede">
          Only the candidate is in this recording. They answered the questions
          alone.
        </p>
        {!session.recordings || session.recordings.length === 0 ? (
          <div className="empty-state">
            <strong>No candidate recording</strong>
            <p>
              The camera file was not uploaded. Answers are still available
              below.
            </p>
          </div>
        ) : (
          session.recordings.map((recording) => (
            <AuthedFaceVideo
              key={recording.id}
              technicalInterviewId={session.id}
              recordingId={recording.id}
              label={`${recording.label} · ${recording.durationSeconds ?? '?'}s · ${Math.round(recording.sizeBytes / 1024)} KB`}
            />
          ))
        )}
        {session.integrityEvents && session.integrityEvents.length > 0 ? (
          <div className="review-answer-block">
            <strong>Anti-cheat notes</strong>
            <ul className="detail-list">
              {session.integrityEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.eventType.replace(/_/g, ' ')}</strong>
                  <span>
                    {event.message || 'Recorded'} ·{' '}
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="tech-question-list">
        {session.questions.map((link, index) => {
          const q = link.question;
          const answer = session.answers.find(
            (a) => a.questionId === link.questionId,
          );
          const needsManual =
            q.type === 'SHORT_ANSWER' || q.type === 'CODING';
          const correctOption = q.options.find((o) => o.isCorrect);

          return (
            <article key={link.id} className="tech-question">
              <div className="tech-q-head">
                <span className="tech-q-index">{index + 1}</span>
                <div>
                  <h2>{q.title}</h2>
                  <p className="tech-q-prompt">{q.body}</p>
                </div>
                <span className="status-pill">
                  {q.type.replace('_', ' ')} · {answer?.score ?? '—'}/
                  {link.points}
                </span>
              </div>

              {q.type === 'MCQ' ? (
                <div className="review-answer-block">
                  <p>
                    <strong>Selected:</strong>{' '}
                    {q.options.find((o) => o.id === answer?.selectedOptionId)
                      ?.text ?? '—'}
                  </p>
                  {correctOption ? (
                    <p className="meta">Correct: {correctOption.text}</p>
                  ) : null}
                </div>
              ) : null}

              {q.type === 'SHORT_ANSWER' ? (
                <div className="review-answer-block">
                  <strong>Answer</strong>
                  <pre className="answer-pre">
                    {answer?.answerText || '—'}
                  </pre>
                </div>
              ) : null}

              {q.type === 'CODING' ? (
                <div className="review-answer-block">
                  <strong>Code</strong>
                  <pre className="code-area answer-pre">
                    {answer?.code || '—'}
                  </pre>
                </div>
              ) : null}

              {allowGrade && needsManual ? (
                <div className="grade-row form-grid">
                  <label>
                    Score (0–{link.points})
                    <input
                      type="number"
                      min={0}
                      max={link.points}
                      value={gradeScores[link.questionId] ?? 0}
                      onChange={(e) =>
                        setGradeScores((prev) => ({
                          ...prev,
                          [link.questionId]: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <label className="full">
                    Feedback
                    <textarea
                      rows={2}
                      value={gradeFeedback[link.questionId] ?? ''}
                      onChange={(e) =>
                        setGradeFeedback((prev) => ({
                          ...prev,
                          [link.questionId]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={gradingId === link.questionId}
                      onClick={() =>
                        void onGrade(link.questionId, link.points)
                      }
                    >
                      {gradingId === link.questionId
                        ? 'Saving…'
                        : 'Save grade'}
                    </button>
                  </div>
                </div>
              ) : answer?.feedback ? (
                <p className="meta">Feedback: {answer.feedback}</p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="form-actions">
        <Link className="ghost-btn" to="/technical-interview">
          Back to assessments
        </Link>
      </div>
    </section>
  );
}
