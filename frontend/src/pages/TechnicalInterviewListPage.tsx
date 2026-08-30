import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  EmptyState,
  Modal,
  SkeletonList,
  StatusPill,
  useToast,
} from '../components/ui';
import { useAsyncData } from '../hooks/useAsyncData';
import { questionBankApi, technicalInterviewApi } from '../lib/api';
import type { QuestionBankItem } from '../types/questionBank';
import type { TechnicalInterviewSession } from '../types/technicalInterview';

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function candidateLink(session: TechnicalInterviewSession) {
  if (session.inviteToken) {
    return `${window.location.origin}/tech-join/${session.inviteToken}`;
  }
  return session.candidateJoinUrl || '';
}

async function copyText(text: string) {
  if (!text) throw new Error('No link available.');
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
  }
}

export function TechnicalInterviewListPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('TechnicalInterview.Create');
  const canDelete = hasPermission('Interview.Delete');
  const canReview =
    hasPermission('TechnicalInterview.Review') ||
    hasPermission('TechnicalInterview.View');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState('');
  const [editingLink, setEditingLink] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const [title, setTitle] = useState('Technical Assessment');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [interviewerId, setInterviewerId] = useState('');
  const [candidateFirstName, setCandidateFirstName] = useState('Casey');
  const [candidateLastName, setCandidateLastName] = useState('Candidate');
  const [candidateEmail, setCandidateEmail] = useState('candidate@acme.com');
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');

  const { data, loading, error, reload } = useAsyncData(
    useCallback(async () => {
      const response = await technicalInterviewApi.list();
      const pickers = canCreate
        ? await Promise.all([
            technicalInterviewApi.interviewers(),
            questionBankApi
              .list()
              .catch(() => ({ data: [] as QuestionBankItem[] })),
          ])
        : null;
      return {
        sessions: response.data ?? [],
        interviewers: pickers?.[0].data ?? [],
        bank: pickers?.[1].data ?? [],
      };
    }, [canCreate]),
    [canCreate],
  );

  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const interviewers = useMemo(() => data?.interviewers ?? [], [data]);
  const bank = useMemo(() => data?.bank ?? [], [data]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('Technical Assessment');
    const now = new Date();
    now.setSeconds(0, 0);
    const close = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setScheduledAt(toLocalInput(now.toISOString()));
    setEndsAt(toLocalInput(close.toISOString()));
    setTimeLimitMinutes(60);
    setCandidateFirstName('Casey');
    setCandidateLastName('Candidate');
    setCandidateEmail('candidate@acme.com');
    setQuestionIds([]);
    setInstructions('');
    setNotes('');
    if (interviewers.length > 0) {
      const preferred =
        interviewers.find((item) => item.email === 'interviewer@acme.com') ??
        interviewers[0];
      setInterviewerId(preferred.id);
    }
  };

  useEffect(() => {
    if (!scheduledAt) {
      const now = new Date();
      now.setSeconds(0, 0);
      const close = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setScheduledAt(toLocalInput(now.toISOString()));
      setEndsAt(toLocalInput(close.toISOString()));
    }
  }, [scheduledAt]);

  useEffect(() => {
    if (!interviewerId && interviewers.length > 0) {
      const preferred =
        interviewers.find((item) => item.email === 'interviewer@acme.com') ??
        interviewers[0];
      setInterviewerId(preferred.id);
    }
  }, [interviewers, interviewerId]);

  const active = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.attemptStatus !== 'SUBMITTED' &&
          s.attemptStatus !== 'REVIEWED' &&
          s.attemptStatus !== 'EXPIRED' &&
          s.interview.status !== 'COMPLETED' &&
          s.interview.status !== 'CANCELLED',
      ),
    [sessions],
  );

  const past = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.attemptStatus === 'SUBMITTED' ||
          s.attemptStatus === 'REVIEWED' ||
          s.attemptStatus === 'EXPIRED' ||
          s.interview.status === 'COMPLETED' ||
          s.interview.status === 'CANCELLED',
      ),
    [sessions],
  );

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setCreatedLink('');
    setEditingLink('');
  };

  const openCreate = () => {
    resetForm();
    setCreatedLink('');
    setEditingLink('');
    setShowForm(true);
  };

  const openEdit = (session: TechnicalInterviewSession) => {
    setEditingId(session.id);
    setTitle(session.interview.title);
    setScheduledAt(toLocalInput(session.interview.scheduledAt));
    setEndsAt(toLocalInput(session.interview.endsAt));
    setTimeLimitMinutes(session.timeLimitMinutes);
    setInterviewerId(session.interview.interviewer.id);
    setCandidateFirstName(session.interview.candidate.firstName);
    setCandidateLastName(session.interview.candidate.lastName);
    setCandidateEmail(session.interview.candidate.email);
    setQuestionIds(session.questions.map((q) => q.questionId));
    setInstructions(session.instructions ?? '');
    setNotes(session.interview.notes ?? '');
    setCreatedLink('');
    setEditingLink(candidateLink(session));
    setShowForm(true);
  };

  const toggleQuestion = (id: string) => {
    setQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (questionIds.length === 0) {
      toast.error('Select at least one question from the bank.');
      return;
    }
    setSaving(true);
    const payload = {
      title,
      scheduledAt: new Date(scheduledAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      timeLimitMinutes,
      interviewerId,
      candidateFirstName,
      candidateLastName,
      candidateEmail,
      questionIds,
      instructions: instructions || undefined,
      notes: notes || undefined,
    };
    try {
      if (editingId) {
        await technicalInterviewApi.update(editingId, payload);
        toast.success('Assessment updated.');
        setShowForm(false);
        setEditingId(null);
      } else {
        const created = await technicalInterviewApi.create(payload);
        const link = created.data ? candidateLink(created.data) : '';
        setCreatedLink(link);
        setEditingLink(link);
        toast.success(
          'Assessment created.',
          link ? 'Copy and share the candidate invite link below.' : undefined,
        );
        if (link) {
          try {
            await copyText(link);
          } catch {
            // ignore
          }
        }
      }
      reload();
    } catch (err) {
      toast.error(
        'Save failed.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onCopyLink = async (session: TechnicalInterviewSession) => {
    const url = candidateLink(session);
    try {
      await copyText(url);
      setCopiedId(session.id);
      toast.success('Candidate link copied', url);
      window.setTimeout(
        () => setCopiedId((id) => (id === session.id ? null : id)),
        2500,
      );
    } catch {
      toast.info('Copy manually', url);
    }
  };

  const onCopyTextLink = async (url: string) => {
    if (!url) return;
    try {
      await copyText(url);
      toast.success('Candidate link copied', url);
    } catch {
      toast.info('Copy manually', url);
    }
  };

  const onRegenerateInvite = async () => {
    if (!editingId) return;
    const confirmed = window.confirm(
      'Generate a new candidate link? The old link will stop working.',
    );
    if (!confirmed) return;
    setRegenerating(true);
    try {
      const response = await technicalInterviewApi.regenerateInvite(editingId);
      const link = response.data ? candidateLink(response.data) : '';
      setEditingLink(link);
      setCreatedLink(link);
      toast.success('New candidate invite link generated.');
      if (link) {
        try {
          await copyText(link);
        } catch {
          // ignore
        }
      }
      reload();
    } catch (err) {
      toast.error(
        'Unable to regenerate link.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setRegenerating(false);
    }
  };

  const onDelete = async (session: TechnicalInterviewSession) => {
    const confirmed = window.confirm(
      `Delete "${session.interview.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await technicalInterviewApi.remove(session.id);
      toast.success('Assessment deleted.');
      if (editingId === session.id) {
        setShowForm(false);
        setEditingId(null);
      }
      reload();
    } catch (err) {
      toast.error(
        'Delete failed.',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Technical Interview</p>
          <h1>Timed assessments</h1>
          <p className="lede">
            Assign question-bank items, set an open window and time limit, then
            share a candidate invite link.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate}>Create assessment</Button>
        ) : null}
      </header>

      {error ? (
        <div className="alert" role="alert">
          {error}
          <Button variant="link" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <h2 className="section-title">Active</h2>
          <div className="session-list">
            {active.length === 0 ? (
              <EmptyState
                title="No active assessments"
                description="Create one to pick questions, set the open window, and share a candidate link."
                action={
                  canCreate ? (
                    <Button onClick={openCreate}>Create assessment</Button>
                  ) : null
                }
              />
            ) : (
              active.map((session) => (
                <article key={session.id} className="session-card">
                  <div>
                    <div className="session-top">
                      <h3>{session.interview.title}</h3>
                      <StatusPill status={session.attemptStatus}>
                        {session.attemptStatus.replace('_', ' ')}
                      </StatusPill>
                    </div>
                    <p>
                      {session.interview.candidate.firstName}{' '}
                      {session.interview.candidate.lastName} · Interviewer{' '}
                      {session.interview.interviewer.firstName}{' '}
                      {session.interview.interviewer.lastName}
                    </p>
                    <p className="meta">
                      {formatWhen(session.interview.scheduledAt)} →{' '}
                      {formatWhen(session.interview.endsAt)} ·{' '}
                      {session.timeLimitMinutes} min · {session.questions.length}{' '}
                      questions · {session.maxScore} pts
                    </p>
                    <div className="share-row">
                      <label className="share-label">Candidate invite link</label>
                      <div className="share-controls">
                        <input
                          readOnly
                          value={candidateLink(session)}
                          aria-label="Candidate join link"
                          onFocus={(e) => e.currentTarget.select()}
                          onClick={(e) => e.currentTarget.select()}
                        />
                        <Button onClick={() => void onCopyLink(session)}>
                          {copiedId === session.id ? 'Copied!' : 'Copy link'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="session-actions">
                    {canCreate ? (
                      <Button variant="ghost" onClick={() => openEdit(session)}>
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="danger"
                        onClick={() => void onDelete(session)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>

          <h2 className="section-title">Submitted / closed</h2>
          <div className="session-list">
            {past.length === 0 ? (
              <EmptyState
                title="Nothing submitted yet"
                description="Completed attempts show up here for review and grading."
              />
            ) : (
              past.map((session) => (
                <article key={session.id} className="session-card muted">
                  <div>
                    <div className="session-top">
                      <h3>{session.interview.title}</h3>
                      <StatusPill>
                        {session.attemptStatus.replace('_', ' ')}
                      </StatusPill>
                    </div>
                    <p className="meta">
                      {session.interview.candidate.firstName}{' '}
                      {session.interview.candidate.lastName}
                      {session.totalScore != null
                        ? ` · Score ${session.totalScore}/${session.maxScore}`
                        : ''}
                    </p>
                  </div>
                  {canReview ? (
                    <Link
                      className="ghost-btn"
                      to={`/technical-interview/${session.id}/review`}
                    >
                      Review
                    </Link>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </>
      )}

      {showForm ? (
        <Modal
          title={
            createdLink && !editingId
              ? 'Assessment created'
              : editingId
                ? 'Edit assessment'
                : 'Create technical assessment'
          }
          onClose={closeForm}
          onSubmit={(e) => void onSubmit(e)}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={closeForm}>
                {createdLink && !editingId ? 'Done' : 'Cancel'}
              </Button>
              {createdLink && !editingId ? null : (
                <Button type="submit" loading={saving}>
                  {editingId ? 'Save changes' : 'Create & generate link'}
                </Button>
              )}
            </>
          }
        >
          <div className="form-grid">
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label>
              Time limit (minutes)
              <input
                type="number"
                min={15}
                max={240}
                value={timeLimitMinutes}
                onChange={(e) =>
                  setTimeLimitMinutes(Number(e.target.value) || 15)
                }
                required
              />
            </label>
            <label>
              Opens from
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => {
                  const next = e.target.value;
                  setScheduledAt(next);
                  if (next && (!endsAt || new Date(endsAt) <= new Date(next))) {
                    const close = new Date(
                      new Date(next).getTime() + 2 * 60 * 60 * 1000,
                    );
                    setEndsAt(toLocalInput(close.toISOString()));
                  }
                }}
                required
              />
            </label>
            <label>
              Closes at
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </label>
            <label>
              Interviewer
              <select
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                required
              >
                {interviewers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName} ({item.role.displayName})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Candidate first name
              <input
                value={candidateFirstName}
                onChange={(e) => setCandidateFirstName(e.target.value)}
                required
              />
            </label>
            <label>
              Candidate last name
              <input
                value={candidateLastName}
                onChange={(e) => setCandidateLastName(e.target.value)}
                required
              />
            </label>
            <label>
              Candidate email
              <input
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                required
              />
            </label>
            <label className="full">
              Instructions
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
              />
            </label>
            <label className="full">
              Internal notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </label>
            <div className="full question-picker">
              <div className="modal-header">
                <strong>Questions from bank</strong>
                <span className="meta">{questionIds.length} selected</span>
              </div>
              {bank.length === 0 ? (
                <p className="lede">
                  No questions available. Add some in Question Bank first.
                </p>
              ) : (
                <div className="question-picker-list">
                  {bank.map((q) => (
                    <label key={q.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={questionIds.includes(q.id)}
                        onChange={() => toggleQuestion(q.id)}
                      />
                      <span>
                        {q.title}{' '}
                        <span className="meta">
                          ({q.type.replace('_', ' ')} · {q.points} pts)
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(editingLink || createdLink) && (editingId || createdLink) ? (
            <div className="share-row invite-link-box">
              <label className="share-label">Candidate invite link</label>
              <p className="lede">
                Share this link with the candidate. It only works between Opens
                from and Closes at.
              </p>
              <div className="share-controls">
                <input
                  readOnly
                  value={editingLink || createdLink}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  onClick={() => void onCopyTextLink(editingLink || createdLink)}
                >
                  Copy link
                </Button>
                {editingId ? (
                  <Button
                    variant="ghost"
                    loading={regenerating}
                    onClick={() => void onRegenerateInvite()}
                  >
                    Generate new link
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
