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
import { liveInterviewApi } from '../lib/api';
import type { LiveInterviewSession } from '../types/liveInterview';

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

function candidateLink(session: LiveInterviewSession) {
  if (session.inviteToken) {
    return `${window.location.origin}/join/${session.inviteToken}`;
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

export function LiveInterviewListPage() {
  const { hasPermission, user } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('Interview.Create');
  const canEdit = hasPermission('Interview.Edit');
  const canDelete = hasPermission('Interview.Delete');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('Live Interview');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [interviewerId, setInterviewerId] = useState('');
  const [candidateFirstName, setCandidateFirstName] = useState('Casey');
  const [candidateLastName, setCandidateLastName] = useState('Candidate');
  const [candidateEmail, setCandidateEmail] = useState('candidate@acme.com');
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [notes, setNotes] = useState('');

  const { data, loading, error, reload } = useAsyncData(
    useCallback(async () => {
      const response = await liveInterviewApi.list();
      const interviewerResponse =
        canCreate || canEdit ? await liveInterviewApi.interviewers() : null;
      return {
        sessions: response.data ?? [],
        interviewers: interviewerResponse?.data ?? [],
      };
    }, [canCreate, canEdit]),
    [canCreate, canEdit],
  );

  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const interviewers = useMemo(() => data?.interviewers ?? [], [data]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('Live Interview');
    const now = new Date();
    now.setSeconds(0, 0);
    const close = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setScheduledAt(toLocalInput(now.toISOString()));
    setEndsAt(toLocalInput(close.toISOString()));
    setCandidateFirstName('Casey');
    setCandidateLastName('Candidate');
    setCandidateEmail('candidate@acme.com');
    setRecordingEnabled(true);
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

  const upcoming = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.interview.status !== 'COMPLETED' &&
          s.interview.status !== 'CANCELLED',
      ),
    [sessions],
  );
  const past = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.interview.status === 'COMPLETED' ||
          s.interview.status === 'CANCELLED',
      ),
    [sessions],
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState('');
  const [editingLink, setEditingLink] = useState('');
  const [regenerating, setRegenerating] = useState(false);

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

  const openEdit = (session: LiveInterviewSession) => {
    setEditingId(session.id);
    setTitle(session.interview.title);
    setScheduledAt(toLocalInput(session.interview.scheduledAt));
    setEndsAt(toLocalInput(session.interview.endsAt));
    setInterviewerId(session.interview.interviewer.id);
    setCandidateFirstName(session.interview.candidate.firstName);
    setCandidateLastName(session.interview.candidate.lastName);
    setCandidateEmail(session.interview.candidate.email);
    setRecordingEnabled(session.recordingEnabled);
    setNotes(session.interview.notes ?? '');
    setCreatedLink('');
    setEditingLink(candidateLink(session));
    setShowForm(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      title,
      scheduledAt: new Date(scheduledAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      interviewerId,
      candidateFirstName,
      candidateLastName,
      candidateEmail,
      recordingEnabled,
      notes: notes || undefined,
    };
    try {
      if (editingId) {
        await liveInterviewApi.update(editingId, payload);
        toast.success('Interview updated.');
        setShowForm(false);
        setEditingId(null);
      } else {
        const created = await liveInterviewApi.create(payload);
        const link = created.data ? candidateLink(created.data) : '';
        setCreatedLink(link);
        setEditingLink(link);
        toast.success(
          'Interview created.',
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

  const onCopyLink = async (session: LiveInterviewSession) => {
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
      const response = await liveInterviewApi.regenerateInvite(editingId);
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

  const onDelete = async (session: LiveInterviewSession) => {
    const confirmed = window.confirm(
      `Delete "${session.interview.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await liveInterviewApi.remove(session.id);
      toast.success('Interview deleted.');
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
          <p className="eyebrow">Live Interview</p>
          <h1>Video interview rooms</h1>
          <p className="lede">
            Set an open and close time for each session. Candidates can only join
            within that window; after it ends the interview and link close
            automatically.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => openCreate()}>Create live interview</Button>
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
          <h2 className="section-title">Upcoming</h2>
          <div className="session-list">
            {upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming live interviews"
                description="Schedule one to generate a candidate invite link with its own open and close time."
              />
            ) : (
              upcoming.map((session) => (
                <article key={session.id} className="session-card">
                  <div>
                    <div className="session-top">
                      <h3>{session.interview.title}</h3>
                      <StatusPill status={session.interview.status}>
                        {session.interview.status.replace('_', ' ')}
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
                      {formatWhen(session.interview.endsAt)} · Room{' '}
                      <strong>{session.roomCode}</strong>
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
                        <a
                          className="ghost-btn"
                          href={`mailto:${session.interview.candidate.email}?subject=${encodeURIComponent(`Interview invite: ${session.interview.title}`)}&body=${encodeURIComponent(`Hi ${session.interview.candidate.firstName},\n\nPlease join your live interview using this link:\n${candidateLink(session)}\n\nOpen from: ${formatWhen(session.interview.scheduledAt)}\nCloses at: ${formatWhen(session.interview.endsAt)}\n`)}`}
                        >
                          Email candidate
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="session-actions">
                    <Link
                      className="primary-btn"
                      to={`/live-interview/${session.id}/lobby`}
                    >
                      {user?.userId === session.interview.candidate.userId
                        ? 'Join as candidate'
                        : 'Enter lobby'}
                    </Link>
                    {canEdit ? (
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

          <h2 className="section-title">Completed</h2>
          <div className="session-list">
            {past.length === 0 ? (
              <EmptyState
                title="No completed sessions yet"
                description="Finished interviews move here with their feedback."
              />
            ) : (
              past.map((session) => (
                <article key={session.id} className="session-card muted">
                  <div>
                    <h3>{session.interview.title}</h3>
                    <p className="meta">
                      {formatWhen(session.interview.scheduledAt)} →{' '}
                      {formatWhen(session.interview.endsAt)} ·{' '}
                      {session.interview.feedback.length} feedback
                      {session.interview.feedback.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Link
                    className="ghost-btn"
                    to={`/live-interview/${session.id}/review`}
                  >
                    View
                  </Link>
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
              ? 'Interview created'
              : editingId
                ? 'Edit live interview'
                : 'Schedule live interview'
          }
          onClose={closeForm}
          onSubmit={(e) => void onSubmit(e)}
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
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={recordingEnabled}
                onChange={(e) => setRecordingEnabled(e.target.checked)}
              />
              Enable recording option
            </label>
            <label className="full">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </label>
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
