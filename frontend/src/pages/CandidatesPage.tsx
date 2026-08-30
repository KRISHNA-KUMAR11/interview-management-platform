import { useCallback, useState, type FormEvent } from 'react';
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
import { candidateApi } from '../lib/api';
import { formatWhen, titleCase } from '../lib/format';
import type { Candidate, CreateCandidateInput } from '../types/candidate';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '' };

export function CandidatesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('Candidate.Create');
  const canEdit = hasPermission('Candidate.Edit');
  const canDelete = hasPermission('Candidate.Delete');

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const {
    data: candidates,
    loading,
    error,
    reload,
  } = useAsyncData(
    useCallback(async () => {
      const response = await candidateApi.list(search);
      return response.data ?? [];
    }, [search]),
    [search],
    { debounceMs: 300 },
  );

  const rows = candidates ?? [];

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (candidate: Candidate) => {
    setEditingId(candidate.id);
    setForm({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone ?? '',
    });
    setShowForm(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: CreateCandidateInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      };

      if (editingId) {
        await candidateApi.update(editingId, payload);
        toast.success('Candidate updated');
      } else {
        await candidateApi.create(payload);
        toast.success('Candidate added');
      }
      closeForm();
      reload();
    } catch (err) {
      toast.error(
        'Save failed',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (candidate: Candidate) => {
    const confirmed = window.confirm(
      `Delete ${candidate.firstName} ${candidate.lastName}?`,
    );
    if (!confirmed) return;

    try {
      await candidateApi.remove(candidate.id);
      toast.success('Candidate deleted');
      reload();
    } catch (err) {
      toast.error(
        'Delete failed',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Candidates</p>
          <h1>Candidate pipeline</h1>
          <p className="lede">
            Everyone you have interviewed or plan to interview, with their full
            session history.
          </p>
        </div>
        {canCreate ? <Button onClick={openCreate}>Add candidate</Button> : null}
      </header>

      {error ? (
        <div className="alert" role="alert">
          {error}
          <Button variant="link" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="filter-bar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search candidates"
        />
        <span className="filter-count">
          {rows.length} candidate{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? 'No matches' : 'No candidates yet'}
          description={
            search
              ? 'Try a different name or email.'
              : 'Add a candidate here, or one will be created automatically when you schedule an interview.'
          }
          action={
            canCreate && !search ? (
              <Button onClick={openCreate}>Add your first candidate</Button>
            ) : null
          }
        />
      ) : (
        <div className="session-list">
          {rows.map((candidate) => {
            const expanded = expandedId === candidate.id;
            return (
              <article key={candidate.id} className="session-card">
                <div>
                  <div className="session-top">
                    <h3>
                      {candidate.firstName} {candidate.lastName}
                    </h3>
                    {candidate.stats.upcoming > 0 ? (
                      <StatusPill status="IN_PROGRESS">
                        {candidate.stats.upcoming} upcoming
                      </StatusPill>
                    ) : null}
                    {candidate.hasLogin ? (
                      <StatusPill>Has login</StatusPill>
                    ) : null}
                  </div>
                  <p className="meta">
                    {candidate.email}
                    {candidate.phone ? ` · ${candidate.phone}` : ''}
                  </p>

                  <div className="stat-row">
                    <span>
                      <strong>{candidate.stats.total}</strong> interviews
                    </span>
                    <span>
                      <strong>{candidate.stats.completed}</strong> completed
                    </span>
                    <span>
                      Next:{' '}
                      <strong>{formatWhen(candidate.nextInterviewAt)}</strong>
                    </span>
                  </div>

                  {candidate.interviews.length > 0 ? (
                    <>
                      <Button
                        variant="link"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedId(expanded ? null : candidate.id)
                        }
                      >
                        {expanded
                          ? 'Hide interview history'
                          : `Show interview history (${candidate.interviews.length})`}
                      </Button>

                      {expanded ? (
                        <ul className="history-list">
                          {candidate.interviews.map((interview) => (
                            <li key={interview.id}>
                              <div>
                                <strong>{interview.title}</strong>
                                <span className="meta">
                                  {titleCase(interview.type)} ·{' '}
                                  {formatWhen(interview.scheduledAt)} ·{' '}
                                  {interview.interviewerName}
                                </span>
                              </div>
                              <div className="history-actions">
                                <StatusPill status={interview.status}>
                                  {titleCase(interview.status)}
                                </StatusPill>
                                {interview.liveInterviewId ? (
                                  <Link
                                    className="link-btn"
                                    to={`/live-interview/${interview.liveInterviewId}/review`}
                                  >
                                    Live review
                                  </Link>
                                ) : null}
                                {interview.technicalInterviewId ? (
                                  <Link
                                    className="link-btn"
                                    to={`/technical-interview/${interview.technicalInterviewId}/review`}
                                  >
                                    Assessment
                                  </Link>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="meta">No interviews scheduled yet.</p>
                  )}
                </div>

                <div className="session-actions">
                  {canEdit ? (
                    <Button variant="ghost" onClick={() => openEdit(candidate)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="danger"
                      onClick={() => void onDelete(candidate)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showForm ? (
        <Modal
          title={editingId ? 'Edit candidate' : 'Add candidate'}
          onClose={closeForm}
          onSubmit={(event) => void onSubmit(event)}
          footer={
            <>
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save changes' : 'Add candidate'}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <label>
              First name
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                required
                minLength={2}
              />
            </label>
            <label>
              Last name
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
              />
            </label>
            <label>
              Phone <span className="optional">optional</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                placeholder="+1 555 0100"
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
