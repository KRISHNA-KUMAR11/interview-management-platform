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
import {
  candidateApi,
  interviewApi,
  questionBankApi,
} from '../lib/api';
import {
  copyText,
  formatWhen,
  nowLocalInput,
  titleCase,
  toLocalInput,
} from '../lib/format';
import type {
  CreateInterviewInput,
  InterviewStatus,
  InterviewType,
  ManagedInterview,
} from '../types/interview';
import type { QuestionBankItem } from '../types/questionBank';

const STATUS_OPTIONS: InterviewStatus[] = [
  'SCHEDULED',
  'WAITING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

const TYPE_OPTIONS: InterviewType[] = ['LIVE', 'TECHNICAL', 'COMBINED'];

function inviteUrl(interview: ManagedInterview) {
  if (interview.liveSession) {
    return `${window.location.origin}/join/${interview.liveSession.inviteToken}`;
  }
  if (interview.technicalSession) {
    return `${window.location.origin}/tech-join/${interview.technicalSession.inviteToken}`;
  }
  return '';
}

export function InterviewManagementPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('Interview.Create');
  const canEdit = hasPermission('Interview.Edit');
  const canDelete = hasPermission('Interview.Delete');

  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InterviewStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<InterviewType | ''>('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<InterviewType>('LIVE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [interviewerId, setInterviewerId] = useState('');
  const [candidateMode, setCandidateMode] = useState<'existing' | 'new'>('new');
  const [candidateId, setCandidateId] = useState('');
  const [candidateFirstName, setCandidateFirstName] = useState('');
  const [candidateLastName, setCandidateLastName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<InterviewStatus>('SCHEDULED');
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [instructions, setInstructions] = useState('');
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  const needsTechnical = type === 'TECHNICAL' || type === 'COMBINED';
  const needsLive = type === 'LIVE' || type === 'COMBINED';

  const { data, loading, error, reload } = useAsyncData(
    useCallback(async () => {
      const [listResponse, summaryResponse] = await Promise.all([
        interviewApi.list({
          search,
          status: statusFilter,
          type: typeFilter,
        }),
        interviewApi.summary(),
      ]);
      return {
        interviews: listResponse.data ?? [],
        stats: summaryResponse.data ?? null,
      };
    }, [search, statusFilter, typeFilter]),
    [search, statusFilter, typeFilter],
    { debounceMs: 250 },
  );

  const interviews = data?.interviews ?? [];
  const stats = data?.stats ?? null;

  const { data: pickers } = useAsyncData(
    useCallback(async () => {
      try {
        const [interviewerResponse, candidateResponse] = await Promise.all([
          interviewApi.interviewers(),
          candidateApi.list(),
        ]);
        return {
          interviewers: interviewerResponse.data ?? [],
          candidates: candidateResponse.data ?? [],
        };
      } catch {
        // Pickers stay empty; the form still works with manual entry.
        return { interviewers: [], candidates: [] };
      }
    }, []),
    [],
    { enabled: canCreate || canEdit },
  );

  const interviewers = pickers?.interviewers ?? [];
  const candidates = pickers?.candidates ?? [];

  useEffect(() => {
    if (!showForm || !needsTechnical) return;
    let cancelled = false;
    setQuestionsLoading(true);
    void (async () => {
      try {
        const response = await questionBankApi.list();
        if (!cancelled) setQuestions(response.data ?? []);
      } catch {
        if (!cancelled) setQuestions([]);
      } finally {
        if (!cancelled) setQuestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm, needsTechnical]);

  const visibleQuestions = useMemo(() => {
    const term = questionSearch.trim().toLowerCase();
    return questions.filter((question) => {
      if (questionTypeFilter && question.type !== questionTypeFilter) {
        return false;
      }
      if (!term) return true;
      return (
        question.title.toLowerCase().includes(term) ||
        question.body.toLowerCase().includes(term)
      );
    });
  }, [questions, questionSearch, questionTypeFilter]);

  const selectedPoints = useMemo(
    () =>
      questions
        .filter((question) => questionIds.includes(question.id))
        .reduce((sum, question) => sum + question.points, 0),
    [questions, questionIds],
  );

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setType('LIVE');
    setScheduledAt(nowLocalInput());
    setEndsAt(nowLocalInput(120));
    setCandidateMode(candidates.length > 0 ? 'existing' : 'new');
    setCandidateId(candidates[0]?.id ?? '');
    setCandidateFirstName('');
    setCandidateLastName('');
    setCandidateEmail('');
    setNotes('');
    setStatus('SCHEDULED');
    setRecordingEnabled(true);
    setTimeLimitMinutes(60);
    setInstructions('');
    setQuestionIds([]);
    setQuestionSearch('');
    setQuestionTypeFilter('');
    setInterviewerId(interviewers[0]?.id ?? '');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (interview: ManagedInterview) => {
    setEditingId(interview.id);
    setTitle(interview.title);
    setType(interview.type);
    setScheduledAt(toLocalInput(interview.scheduledAt));
    setEndsAt(toLocalInput(interview.endsAt));
    setInterviewerId(interview.interviewer.id);
    setNotes(interview.notes ?? '');
    setStatus(interview.status);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await interviewApi.update(editingId, {
          title: title.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          interviewerId,
          notes: notes.trim() || undefined,
          status,
        });
        toast.success('Interview updated.');
        closeForm();
      } else {
        const payload: CreateInterviewInput = {
          title: title.trim(),
          type,
          scheduledAt: new Date(scheduledAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          interviewerId,
          notes: notes.trim() || undefined,
        };

        if (candidateMode === 'existing') {
          if (!candidateId) throw new Error('Select a candidate.');
          payload.candidateId = candidateId;
        } else {
          payload.candidateFirstName = candidateFirstName.trim();
          payload.candidateLastName = candidateLastName.trim();
          payload.candidateEmail = candidateEmail.trim();
        }

        if (needsLive) payload.recordingEnabled = recordingEnabled;
        if (needsTechnical) {
          if (questionIds.length === 0) {
            throw new Error(
              'Select at least one question from the bank for a technical assessment.',
            );
          }
          payload.timeLimitMinutes = timeLimitMinutes;
          payload.instructions = instructions.trim() || undefined;
          payload.questionIds = questionIds;
        }

        const response = await interviewApi.create(payload);
        const link = response.data ? inviteUrl(response.data) : '';
        toast.success(
          'Interview scheduled.',
          link ? `Candidate link: ${link}` : undefined,
        );
        if (link) {
          try {
            await copyText(link);
          } catch {
            // Clipboard unavailable; the link is shown in the notification.
          }
        }
        closeForm();
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

  const onCancel = async (interview: ManagedInterview) => {
    const confirmed = window.confirm(
      `Cancel "${interview.title}"? The candidate link will stop working.`,
    );
    if (!confirmed) return;
    try {
      await interviewApi.cancel(interview.id);
      toast.success('Interview cancelled.');
      reload();
    } catch (err) {
      toast.error(
        'Cancel failed.',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const onDelete = async (interview: ManagedInterview) => {
    const confirmed = window.confirm(
      `Delete "${interview.title}" permanently? Sessions and feedback go with it.`,
    );
    if (!confirmed) return;
    try {
      await interviewApi.remove(interview.id);
      toast.success('Interview deleted.');
      reload();
    } catch (err) {
      toast.error(
        'Delete failed.',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const onCopy = async (interview: ManagedInterview) => {
    const link = inviteUrl(interview);
    try {
      await copyText(link);
      setCopiedId(interview.id);
      window.setTimeout(() => setCopiedId(''), 2000);
    } catch {
      toast.info('Copy manually', link);
    }
  };

  const toggleQuestion = (id: string) => {
    setQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectVisibleQuestions = () => {
    setQuestionIds((prev) => {
      const next = new Set(prev);
      for (const question of visibleQuestions) next.add(question.id);
      return [...next];
    });
  };

  const clearQuestionSelection = () => setQuestionIds([]);

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Interview Management</p>
          <h1>All interviews</h1>
          <p className="lede">
            Schedule live sessions and technical assessments, reassign
            interviewers, and share candidate links from one place.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={openCreate}>Schedule interview</Button>
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

      {stats ? (
        <div className="stat-grid">
          <div className="stat-card">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card accent">
            <span>Today</span>
            <strong>{stats.today}</strong>
          </div>
          <div className="stat-card">
            <span>Scheduled</span>
            <strong>{stats.scheduled}</strong>
          </div>
          <div className="stat-card warning">
            <span>In progress</span>
            <strong>{stats.inProgress}</strong>
          </div>
          <div className="stat-card info">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </div>
          <div className="stat-card danger">
            <span>Cancelled</span>
            <strong>{stats.cancelled}</strong>
          </div>
        </div>
      ) : null}

      <div className="filter-bar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or candidate…"
          aria-label="Search interviews"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InterviewStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {titleCase(option)}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as InterviewType | '')}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {titleCase(option)}
            </option>
          ))}
        </select>
        <span className="filter-count">{interviews.length} shown</span>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : interviews.length === 0 ? (
        <EmptyState
          title="No interviews found"
          description={
            search || statusFilter || typeFilter
              ? 'Try clearing the filters above.'
              : 'Schedule your first interview to generate a candidate invite link.'
          }
          action={
            canCreate && !search && !statusFilter && !typeFilter ? (
              <Button onClick={openCreate}>Schedule interview</Button>
            ) : null
          }
        />
      ) : (
        <div className="session-list">
          {interviews.map((interview) => (
            <article
              key={interview.id}
              className={`session-card ${
                interview.status === 'CANCELLED' ? 'muted' : ''
              }`}
            >
              <div>
                <div className="session-top">
                  <h3>{interview.title}</h3>
                  <StatusPill status={interview.status}>
                    {titleCase(interview.status)}
                  </StatusPill>
                  <StatusPill>{titleCase(interview.type)}</StatusPill>
                  {interview.windowOpen ? (
                    <StatusPill status="IN_PROGRESS">Open now</StatusPill>
                  ) : null}
                </div>

                <p>
                  {interview.candidate.firstName} {interview.candidate.lastName}{' '}
                  <span className="meta">({interview.candidate.email})</span>
                </p>
                <p className="meta">
                  {formatWhen(interview.scheduledAt)} →{' '}
                  {formatWhen(interview.endsAt)} · Interviewer{' '}
                  {interview.interviewer.firstName}{' '}
                  {interview.interviewer.lastName}
                  {interview.technicalSession
                    ? ` · ${interview.technicalSession.timeLimitMinutes} min limit`
                    : ''}
                  {interview.averageRating != null
                    ? ` · Rating ${interview.averageRating}/5`
                    : ''}
                </p>

                {interview.notes ? (
                  <p className="meta clamp-2">{interview.notes}</p>
                ) : null}

                {inviteUrl(interview) &&
                interview.status !== 'CANCELLED' &&
                interview.status !== 'COMPLETED' ? (
                  <div className="share-row">
                    <label className="share-label">Candidate invite link</label>
                    <div className="share-controls">
                      <input
                        readOnly
                        value={inviteUrl(interview)}
                        aria-label="Candidate invite link"
                        onFocus={(e) => e.currentTarget.select()}
                        onClick={(e) => e.currentTarget.select()}
                      />
                      <Button onClick={() => void onCopy(interview)}>
                        {copiedId === interview.id ? 'Copied!' : 'Copy link'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="session-actions">
                {interview.liveSession ? (
                  <Link
                    className="ghost-btn"
                    to={`/live-interview/${interview.liveSession.id}/review`}
                  >
                    Live review
                  </Link>
                ) : null}
                {interview.technicalSession ? (
                  <Link
                    className="ghost-btn"
                    to={`/technical-interview/${interview.technicalSession.id}/review`}
                  >
                    Assessment
                  </Link>
                ) : null}
                {canEdit ? (
                  <Button variant="ghost" onClick={() => openEdit(interview)}>
                    Edit
                  </Button>
                ) : null}
                {canEdit &&
                interview.status !== 'CANCELLED' &&
                interview.status !== 'COMPLETED' ? (
                  <Button
                    variant="ghost"
                    onClick={() => void onCancel(interview)}
                  >
                    Cancel
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={() => void onDelete(interview)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm ? (
        <Modal
          title={editingId ? 'Edit interview' : 'Schedule interview'}
          onClose={closeForm}
          onSubmit={(e) => void onSubmit(e)}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save changes' : 'Schedule interview'}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <label className="full">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Frontend Engineer — Round 1"
                required
                minLength={3}
              />
            </label>

            {editingId ? (
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InterviewStatus)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Type
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as InterviewType)}
                >
                  <option value="LIVE">Live interview</option>
                  <option value="TECHNICAL">Technical assessment</option>
                  <option value="COMBINED">Both</option>
                </select>
              </label>
            )}

            {!editingId && needsTechnical ? (
              <p className="meta full">
                Pick questions from your bank below. At least one is required.
              </p>
            ) : null}

            <label>
              Interviewer
              <select
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                required
              >
                <option value="">Select interviewer</option>
                {interviewers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.firstName} {option.lastName} ·{' '}
                    {option.role.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Opens from
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
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

            {!editingId ? (
              <div className="full question-options">
                <div className="modal-header">
                  <strong>Candidate</strong>
                  <div className="segmented">
                    <button
                      type="button"
                      className={candidateMode === 'existing' ? 'on' : ''}
                      onClick={() => setCandidateMode('existing')}
                      disabled={candidates.length === 0}
                    >
                      Existing
                    </button>
                    <button
                      type="button"
                      className={candidateMode === 'new' ? 'on' : ''}
                      onClick={() => setCandidateMode('new')}
                    >
                      New
                    </button>
                  </div>
                </div>

                {candidateMode === 'existing' ? (
                  <label>
                    Select candidate
                    <select
                      value={candidateId}
                      onChange={(e) => setCandidateId(e.target.value)}
                      required
                    >
                      <option value="">Select candidate</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.firstName} {candidate.lastName} ·{' '}
                          {candidate.email}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="form-grid">
                    <label>
                      First name
                      <input
                        value={candidateFirstName}
                        onChange={(e) => setCandidateFirstName(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        value={candidateLastName}
                        onChange={(e) => setCandidateLastName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="full">
                      Email
                      <input
                        type="email"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                )}
              </div>
            ) : null}

            {!editingId && needsLive ? (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  onChange={(e) => setRecordingEnabled(e.target.checked)}
                />
                Allow recording in the live room
              </label>
            ) : null}

            {!editingId && needsTechnical ? (
              <>
                <label>
                  Time limit (minutes)
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={timeLimitMinutes}
                    onChange={(e) =>
                      setTimeLimitMinutes(Number(e.target.value) || 60)
                    }
                  />
                </label>
                <label className="full">
                  Instructions <span className="optional">optional</span>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={2}
                    placeholder="Answer all questions. You may use documentation."
                  />
                </label>

                <div className="full question-picker">
                  <div className="modal-header">
                    <strong>Select questions from bank</strong>
                    <span className="filter-count">
                      {questionIds.length} selected · {selectedPoints} pts
                    </span>
                  </div>

                  <div className="filter-bar" style={{ marginBottom: 0 }}>
                    <input
                      type="search"
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      placeholder="Search questions…"
                      aria-label="Search questions"
                    />
                    <select
                      value={questionTypeFilter}
                      onChange={(e) => setQuestionTypeFilter(e.target.value)}
                      aria-label="Filter by question type"
                    >
                      <option value="">All types</option>
                      <option value="MCQ">MCQ</option>
                      <option value="SHORT_ANSWER">Short answer</option>
                      <option value="CODING">Coding</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={selectVisibleQuestions}
                      disabled={visibleQuestions.length === 0}
                    >
                      Select visible
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={clearQuestionSelection}
                      disabled={questionIds.length === 0}
                    >
                      Clear
                    </Button>
                  </div>

                  {questionsLoading ? (
                    <p className="meta">Loading question bank…</p>
                  ) : questions.length === 0 ? (
                    <EmptyState
                      title="No questions in the bank"
                      description="Add MCQ, short-answer, or coding prompts in Question Bank, then come back here to schedule."
                      action={
                        <Link className="primary-btn" to="/question-bank">
                          Open question bank
                        </Link>
                      }
                    />
                  ) : visibleQuestions.length === 0 ? (
                    <p className="meta">
                      No matches. Try a different search or clear the type
                      filter.
                    </p>
                  ) : (
                    <div className="question-picker-list">
                      {visibleQuestions.map((question) => (
                        <label key={question.id} className="mcq-choice">
                          <input
                            type="checkbox"
                            checked={questionIds.includes(question.id)}
                            onChange={() => toggleQuestion(question.id)}
                          />
                          <span>
                            {question.title}
                            <span className="meta">
                              {' '}
                              · {titleCase(question.type)} ·{' '}
                              {titleCase(question.difficulty)} ·{' '}
                              {question.points} pts
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            <label className="full">
              Notes <span className="optional">optional</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes for the hiring team"
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
