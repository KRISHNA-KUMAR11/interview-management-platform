import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFaceRecorder } from '../hooks/useFaceRecorder';
import { technicalInterviewApi } from '../lib/api';
import { techGuestSession } from '../lib/techGuestSession';
import type {
  SaveAnswerInput,
  TechnicalInterviewSession,
} from '../types/technicalInterview';

type DraftMap = Record<
  string,
  {
    answerText?: string;
    selectedOptionId?: string;
    code?: string;
  }
>;

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function draftsFromSession(session: TechnicalInterviewSession): DraftMap {
  const drafts: DraftMap = {};
  for (const link of session.questions) {
    const existing = session.answers.find(
      (a) => a.questionId === link.questionId,
    );
    drafts[link.questionId] = {
      answerText: existing?.answerText ?? '',
      selectedOptionId: existing?.selectedOptionId ?? undefined,
      code: existing?.code ?? link.question.starterCode ?? '',
    };
  }
  return drafts;
}

function toPayload(drafts: DraftMap): SaveAnswerInput[] {
  return Object.entries(drafts).map(([questionId, draft]) => ({
    questionId,
    answerText: draft.answerText || undefined,
    selectedOptionId: draft.selectedOptionId || undefined,
    code: draft.code || undefined,
  }));
}

export function TechnicalTakePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isGuest = techGuestSession.isActiveFor(id) && !isAuthenticated;

  const {
    stream,
    cameraError,
    recording,
    enableCamera,
    startRecording,
    stopRecording,
    stopTracks,
  } = useFaceRecorder();

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [enablingCamera, setEnablingCamera] = useState(false);

  const [session, setSession] = useState<TechnicalInterviewSession | null>(
    null,
  );
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const draftsRef = useRef<DraftMap>({});
  const autoSubmitting = useRef(false);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [stream]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let response = await technicalInterviewApi.get(id);
      let data = response.data;
      if (!data) throw new Error('Assessment not found.');

      if (
        data.attemptStatus === 'SUBMITTED' ||
        data.attemptStatus === 'REVIEWED' ||
        data.attemptStatus === 'EXPIRED'
      ) {
        setSession(data);
        setSubmitted(true);
        setRemaining(0);
        stopTracks();
        return;
      }

      if (data.attemptStatus === 'NOT_STARTED') {
        response = await technicalInterviewApi.start(id);
        data = response.data ?? data;
      }

      setSession(data);
      const nextDrafts = draftsFromSession(data);
      setDrafts(nextDrafts);
      draftsRef.current = nextDrafts;
      setRemaining(data.remainingSeconds);
      startRecording();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load assessment.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, startRecording, stopTracks]);

  const onEnableCamera = async () => {
    setEnablingCamera(true);
    setError('');
    try {
      await enableCamera();
      setCameraReady(true);
      await bootstrap();
    } catch {
      setCameraReady(false);
    } finally {
      setEnablingCamera(false);
    }
  };

  const persist = useCallback(
    async (silent = true) => {
      if (!session || submitted) return;
      if (
        session.attemptStatus !== 'IN_PROGRESS' &&
        session.attemptStatus !== 'NOT_STARTED'
      ) {
        return;
      }
      setSaving(true);
      if (!silent) setInfo('');
      try {
        const response = await technicalInterviewApi.saveAnswers(
          id,
          toPayload(draftsRef.current),
        );
        if (response.data) {
          setSession(response.data);
          setRemaining(response.data.remainingSeconds);
        }
        if (!silent) setInfo('Answers saved.');
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Autosave failed.');
        }
      } finally {
        setSaving(false);
      }
    },
    [id, session, submitted],
  );

  const submitAssessment = useCallback(
    async (auto = false) => {
      if (autoSubmitting.current || submitted) return;
      autoSubmitting.current = true;
      setSubmitting(true);
      setError('');
      try {
        const { blob, durationSeconds } = await stopRecording();
        if (blob) {
          try {
            await technicalInterviewApi.uploadFaceRecording(id, blob, {
              label: 'Candidate face recording',
              durationSeconds,
            });
          } catch (uploadErr) {
            setError(
              uploadErr instanceof Error
                ? `Answers will still submit, but face recording upload failed: ${uploadErr.message}`
                : 'Face recording upload failed. Submitting answers anyway.',
            );
          }
        }

        const response = await technicalInterviewApi.submit(
          id,
          toPayload(draftsRef.current),
        );
        setSession(response.data ?? null);
        setSubmitted(true);
        setRemaining(0);
        stopTracks();
        setInfo(
          auto
            ? 'Time is up. Your answers were submitted automatically.'
            : 'Assessment submitted. Thank you.',
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed.');
        autoSubmitting.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [id, stopRecording, stopTracks, submitted],
  );

  useEffect(() => {
    if (!session || submitted || session.attemptStatus !== 'IN_PROGRESS') {
      return;
    }
    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void submitAssessment(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session, submitted, submitAssessment]);

  useEffect(() => {
    if (!session || submitted || session.attemptStatus !== 'IN_PROGRESS') {
      return;
    }
    const timer = window.setInterval(() => {
      void persist(true);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [session, submitted, persist]);

  const urgent = remaining > 0 && remaining <= 5 * 60;

  const questions = useMemo(() => session?.questions ?? [], [session]);
  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const link of questions) {
      const draft = drafts[link.questionId];
      if (!draft) continue;
      const type = link.question.type;
      const done =
        type === 'MCQ'
          ? Boolean(draft.selectedOptionId)
          : type === 'SHORT_ANSWER'
            ? Boolean(draft.answerText?.trim())
            : Boolean(
                draft.code?.trim() &&
                  draft.code !== (link.question.starterCode ?? ''),
              );
      if (done) ids.add(link.questionId);
    }
    return ids;
  }, [drafts, questions]);
  const answeredCount = answeredIds.size;
  const progressPct = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  if (!cameraReady && !submitted) {
    return (
      <div className="auth-page single">
        <div className="auth-form card">
          <p className="eyebrow">Camera required</p>
          <h2>Enable your camera to continue</h2>
          <p className="lede">
            This assessment records your face for the full duration. Allow
            camera and microphone access, then start.
          </p>
          {(cameraError || error) && (
            <div className="alert" role="alert">
              {cameraError || error}
            </div>
          )}
          <button
            type="button"
            className="primary-btn"
            disabled={enablingCamera}
            onClick={() => void onEnableCamera()}
          >
            {enablingCamera ? 'Opening camera…' : 'Allow camera & start'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Preparing your assessment…</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="auth-page single">
        <div className="auth-form card">
          <h2>Unable to open assessment</h2>
          <p className="lede">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  if (submitted) {
    return (
      <div className="tech-exam-shell">
        <div className="tech-done-card">
          <div className="done-mark" aria-hidden="true">
            ✓
          </div>
          <p className="eyebrow">Submitted</p>
          <h1>{session.interview.title}</h1>
          <p className="lede">
            {info ||
              'Your answers have been submitted. You can close this window.'}
          </p>
          {session.totalScore != null ? (
            <p className="meta">
              Auto-scored so far: {session.totalScore}/{session.maxScore}
            </p>
          ) : (
            <p className="meta">
              Short answers and coding questions will be reviewed by the
              interviewer.
            </p>
          )}
          {!isGuest ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => navigate('/technical-interview')}
            >
              Back to assessments
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="tech-exam">
      <header className="tech-exam-bar">
        <div className="tech-exam-heading">
          <p className="eyebrow">Technical assessment</p>
          <h1>{session.interview.title}</h1>
          {session.instructions ? (
            <p className="lede">{session.instructions}</p>
          ) : null}
        </div>
        <div className="tech-exam-meta">
          <div className={`timer-chip ${urgent ? 'urgent' : ''}`}>
            <span>Time left</span>
            <strong>{formatCountdown(remaining)}</strong>
          </div>
          <p className={`save-state ${saving ? 'busy' : ''}`}>
            {saving
              ? 'Saving…'
              : recording
                ? 'Camera recording · changes saved'
                : 'All changes saved'}
          </p>
        </div>
      </header>

      <div
        className="exam-progress"
        role="progressbar"
        aria-valuenow={answeredCount}
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-label="Questions answered"
      >
        <div className="exam-progress-track">
          <div
            className="exam-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span>
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {info ? <div className="alert success">{info}</div> : null}

      <div className="tech-question-list">
        {questions.map((link, index) => {
          const draft = drafts[link.questionId] ?? {};
          const q = link.question;
          const answered = answeredIds.has(link.questionId);
          return (
            <article
              key={link.id}
              className={`tech-question ${answered ? 'answered' : ''}`}
            >
              <div className="tech-q-head">
                <span className="tech-q-index">
                  {answered ? '✓' : index + 1}
                </span>
                <div>
                  <h2>{q.title}</h2>
                  <p className="tech-q-prompt">{q.body}</p>
                </div>
                <span className="status-pill">
                  {q.type.replace('_', ' ')} · {link.points} pts
                </span>
              </div>

              {q.type === 'MCQ' ? (
                <div className="mcq-options">
                  {q.options.map((opt) => {
                    const selected = draft.selectedOptionId === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`mcq-choice ${selected ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`q-${link.questionId}`}
                          checked={selected}
                          onChange={() =>
                            setDrafts((prev) => ({
                              ...prev,
                              [link.questionId]: {
                                ...prev[link.questionId],
                                selectedOptionId: opt.id,
                              },
                            }))
                          }
                        />
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {q.type === 'SHORT_ANSWER' ? (
                <textarea
                  className="tech-answer-area"
                  value={draft.answerText ?? ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [link.questionId]: {
                        ...prev[link.questionId],
                        answerText: e.target.value,
                      },
                    }))
                  }
                  rows={6}
                  placeholder="Type your answer…"
                />
              ) : null}

              {q.type === 'CODING' ? (
                <textarea
                  className="code-area tech-code-area"
                  value={draft.code ?? ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [link.questionId]: {
                        ...prev[link.questionId],
                        code: e.target.value,
                      },
                    }))
                  }
                  rows={14}
                  spellCheck={false}
                  placeholder="// Write your solution"
                />
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="face-pip" aria-label="Your camera preview">
        <video ref={previewRef} muted playsInline autoPlay />
        <span className={`face-pip-badge ${recording ? 'on' : ''}`}>
          {recording ? 'REC' : 'Camera'}
        </span>
      </div>

      <footer className="tech-exam-footer">
        <p className="meta">
          Your face is being recorded. Answers save automatically.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={saving || submitting}
            onClick={() => void persist(false)}
          >
            {saving ? 'Saving…' : 'Save progress'}
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={submitting}
            onClick={() => {
              const unanswered = questions.length - answeredCount;
              const confirmed = window.confirm(
                unanswered > 0
                  ? `You have ${unanswered} unanswered question${
                      unanswered === 1 ? '' : 's'
                    }. Submit anyway? You will not be able to edit answers after this.`
                  : 'Submit your assessment? You will not be able to edit answers after this.',
              );
              if (confirmed) void submitAssessment(false);
            }}
          >
            {submitting ? 'Submitting…' : 'Submit assessment'}
          </button>
        </div>
      </footer>
    </section>
  );
}
