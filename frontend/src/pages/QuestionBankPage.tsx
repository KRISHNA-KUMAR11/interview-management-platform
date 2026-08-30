import { useCallback, useMemo, useState, type FormEvent } from 'react';
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
import { questionBankApi } from '../lib/api';
import type {
  McqOption,
  QuestionBankItem,
  QuestionDifficulty,
  QuestionType,
} from '../types/questionBank';

function newOption(isCorrect = false): McqOption {
  return {
    id: crypto.randomUUID(),
    text: '',
    isCorrect,
  };
}

export function QuestionBankPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('QuestionBank.Create');
  const canEdit = hasPermission('QuestionBank.Edit');
  const canDelete = hasPermission('QuestionBank.Delete');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | QuestionType>('ALL');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<QuestionType>('MCQ');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('MEDIUM');
  const [language, setLanguage] = useState('javascript');
  const [points, setPoints] = useState(10);
  const [options, setOptions] = useState<McqOption[]>([
    newOption(true),
    newOption(false),
  ]);
  const [starterCode, setStarterCode] = useState('');

  const {
    data: questionData,
    loading,
    error,
    reload,
  } = useAsyncData(
    useCallback(async () => {
      const response = await questionBankApi.list();
      return response.data ?? [];
    }, []),
    [],
  );

  const questions = questionData ?? [];

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setType('MCQ');
    setDifficulty('MEDIUM');
    setLanguage('javascript');
    setPoints(10);
    setOptions([newOption(true), newOption(false)]);
    setStarterCode('');
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const visibleQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (questionData ?? []).filter((question) => {
      if (typeFilter !== 'ALL' && question.type !== typeFilter) return false;
      if (!term) return true;
      return (
        question.title.toLowerCase().includes(term) ||
        question.body.toLowerCase().includes(term)
      );
    });
  }, [questionData, search, typeFilter]);

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (question: QuestionBankItem) => {
    setEditingId(question.id);
    setTitle(question.title);
    setBody(question.body);
    setType(question.type);
    setDifficulty(question.difficulty);
    setLanguage(question.language ?? 'javascript');
    setPoints(question.points);
    setOptions(
      question.options.length >= 2
        ? question.options.map((o) => ({ ...o }))
        : [newOption(true), newOption(false)],
    );
    setStarterCode(question.starterCode ?? '');
    setShowForm(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);

    const payload = {
      title,
      body,
      type,
      difficulty,
      points,
      language: type === 'CODING' ? language : undefined,
      options: type === 'MCQ' ? options : undefined,
      starterCode: type === 'CODING' ? starterCode : undefined,
    };

    try {
      if (editingId) {
        await questionBankApi.update(editingId, payload);
        toast.success('Question updated.');
      } else {
        await questionBankApi.create(payload);
        toast.success('Question created.');
      }
      setShowForm(false);
      resetForm();
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

  const onDelete = async (question: QuestionBankItem) => {
    const confirmed = window.confirm(
      `Delete "${question.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await questionBankApi.remove(question.id);
      toast.success('Question deleted.');
      if (editingId === question.id) {
        setShowForm(false);
        resetForm();
      }
      reload();
    } catch (err) {
      toast.error(
        'Delete failed.',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const updateOption = (id: string, patch: Partial<McqOption>) => {
    setOptions((prev) =>
      prev.map((opt) => {
        if (opt.id !== id) {
          if (patch.isCorrect) return { ...opt, isCorrect: false };
          return opt;
        }
        return { ...opt, ...patch };
      }),
    );
  };

  return (
    <section className="page live-page">
      <header className="page-header live-header">
        <div>
          <p className="eyebrow">Question Bank</p>
          <h1>Assessment questions</h1>
          <p className="lede">
            Build MCQ, short-answer, and coding prompts for technical
            interviews.
          </p>
        </div>
        {canCreate ? <Button onClick={openCreate}>Add question</Button> : null}
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          aria-label="Search questions"
        />
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as 'ALL' | QuestionType)
          }
          aria-label="Filter by type"
        >
          <option value="ALL">All types</option>
          <option value="MCQ">Multiple choice</option>
          <option value="SHORT_ANSWER">Short answer</option>
          <option value="CODING">Coding</option>
        </select>
        <span className="filter-count">
          {visibleQuestions.length} of {questions.length}
        </span>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="session-list">
          {questions.length === 0 ? (
            <EmptyState
              title="No questions yet"
              description="Add MCQ, short-answer, or coding prompts here and reuse them across technical assessments."
              action={
                canCreate ? (
                  <Button onClick={openCreate}>Add your first question</Button>
                ) : null
              }
            />
          ) : visibleQuestions.length === 0 ? (
            <EmptyState
              title="No matches"
              description="Try a different search term or clear the type filter."
            />
          ) : (
            visibleQuestions.map((question) => (
              <article key={question.id} className="session-card">
                <div>
                  <div className="session-top">
                    <h3>{question.title}</h3>
                    <StatusPill>{question.type.replace('_', ' ')}</StatusPill>
                    <StatusPill
                      className={`difficulty-${question.difficulty.toLowerCase()}`}
                    >
                      {question.difficulty}
                    </StatusPill>
                  </div>
                  <p className="meta">
                    {question.points} pts
                    {question.language ? ` · ${question.language}` : ''}
                    {question.options.length
                      ? ` · ${question.options.length} options`
                      : ''}
                  </p>
                  <p className="clamp-2">{question.body}</p>
                </div>
                <div className="session-actions">
                  {canEdit ? (
                    <Button variant="ghost" onClick={() => openEdit(question)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="danger"
                      onClick={() => void onDelete(question)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {showForm ? (
        <Modal
          title={editingId ? 'Edit question' : 'Create question'}
          onClose={closeForm}
          onSubmit={(e) => void onSubmit(e)}
          footer={
            <>
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save changes' : 'Create'}
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
                required
                minLength={3}
              />
            </label>
            <label>
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
              >
                <option value="MCQ">Multiple choice</option>
                <option value="SHORT_ANSWER">Short answer</option>
                <option value="CODING">Coding</option>
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as QuestionDifficulty)
                }
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label>
              Points
              <input
                type="number"
                min={1}
                max={100}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 1)}
                required
              />
            </label>
            {type === 'CODING' ? (
              <label>
                Language
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </label>
            ) : null}
            <label className="full">
              Prompt
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                required
              />
            </label>

            {type === 'MCQ' ? (
              <div className="full question-options">
                <div className="modal-header">
                  <strong>Options</strong>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setOptions((prev) => [...prev, newOption(false)])
                    }
                  >
                    Add option
                  </Button>
                </div>
                {options.map((opt, index) => (
                  <div key={opt.id} className="option-row">
                    <input
                      value={opt.text}
                      onChange={(e) =>
                        updateOption(opt.id, { text: e.target.value })
                      }
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                    <label className="checkbox-row compact">
                      <input
                        type="radio"
                        name="correct-option"
                        checked={Boolean(opt.isCorrect)}
                        onChange={() =>
                          updateOption(opt.id, { isCorrect: true })
                        }
                      />
                      Correct
                    </label>
                    {options.length > 2 ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setOptions((prev) =>
                            prev.filter((item) => item.id !== opt.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {type === 'CODING' ? (
              <label className="full">
                Starter code
                <textarea
                  className="code-area"
                  value={starterCode}
                  onChange={(e) => setStarterCode(e.target.value)}
                  rows={8}
                  spellCheck={false}
                />
              </label>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
