import { useCallback, useState, type FormEvent } from 'react';
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
import { userApi } from '../lib/api';
import { formatWhen, titleCase } from '../lib/format';
import type {
  PlatformUser,
  UpdateUserInput,
  UserStatus,
} from '../types/user';

const STATUSES: UserStatus[] = ['ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING'];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  roleId: '',
  status: 'ACTIVE' as UserStatus,
};

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const toast = useToast();
  const canCreate = hasPermission('User.Create');
  const canEdit = hasPermission('User.Edit');
  const canDelete = hasPermission('User.Delete');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [resettingFor, setResettingFor] = useState<PlatformUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const {
    data: users,
    loading,
    error,
    reload,
  } = useAsyncData(
    useCallback(async () => {
      const response = await userApi.list(search, roleFilter);
      return response.data ?? [];
    }, [search, roleFilter]),
    [search, roleFilter],
    { debounceMs: 300 },
  );

  const { data: roles } = useAsyncData(
    useCallback(async () => {
      const response = await userApi.roles();
      return response.data ?? [];
    }, []),
    [],
  );

  const rows = users ?? [];
  const roleOptions = roles ?? [];

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, roleId: roleOptions[0]?.id ?? '' });
    setShowForm(true);
  };

  const openEdit = (person: PlatformUser) => {
    setEditingId(person.id);
    setForm({
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      password: '',
      roleId: person.roleId,
      status: person.status,
    });
    setShowForm(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const payload: UpdateUserInput = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          roleId: form.roleId,
          status: form.status,
        };
        await userApi.update(editingId, payload);
        toast.success('User updated');
      } else {
        await userApi.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
          roleId: form.roleId,
        });
        toast.success('User created', `${form.email.trim()} can now sign in.`);
      }
      closeForm();
      reload();
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const onResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resettingFor) return;
    setSaving(true);
    try {
      await userApi.resetPassword(resettingFor.id, newPassword);
      toast.success(
        'Password reset',
        `${resettingFor.email} has been signed out of all sessions.`,
      );
      setResettingFor(null);
      setNewPassword('');
    } catch (err) {
      toast.error(
        'Reset failed',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (person: PlatformUser) => {
    const confirmed = window.confirm(
      `Delete ${person.firstName} ${person.lastName}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await userApi.remove(person.id);
      toast.success('User deleted');
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
          <p className="eyebrow">Users</p>
          <h1>Platform users</h1>
          <p className="lede">
            Staff accounts, the role each one holds, and the access that role
            grants.
          </p>
        </div>
        {canCreate ? <Button onClick={openCreate}>Add user</Button> : null}
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
          aria-label="Search users"
        />
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {roleOptions.map((role) => (
            <option key={role.id} value={role.name}>
              {role.displayName}
            </option>
          ))}
        </select>
        <span className="filter-count">
          {rows.length} user{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search || roleFilter ? 'No matches' : 'No users yet'}
          description={
            search || roleFilter
              ? 'Try a different search term or clear the role filter.'
              : 'Invite your first teammate to give them access to the platform.'
          }
          action={
            canCreate && !search && !roleFilter ? (
              <Button onClick={openCreate}>Add your first user</Button>
            ) : null
          }
        />
      ) : (
        <div className="session-list">
          {rows.map((person) => {
            const isSelf = person.id === currentUser?.userId;
            return (
              <article key={person.id} className="session-card">
                <div>
                  <div className="session-top">
                    <h3>
                      {person.firstName} {person.lastName}
                    </h3>
                    <StatusPill status={person.status}>
                      {titleCase(person.status)}
                    </StatusPill>
                    <StatusPill>{person.roleDisplayName}</StatusPill>
                    {isSelf ? <StatusPill status="completed">You</StatusPill> : null}
                  </div>

                  <p className="meta">
                    {person.email}
                    {person.companyName ? ` · ${person.companyName}` : ''}
                  </p>

                  <div className="stat-row">
                    <span>
                      <strong>{person.interviewCount}</strong> interviews
                    </span>
                    <span>
                      Last login:{' '}
                      <strong>{formatWhen(person.lastLoginAt)}</strong>
                    </span>
                    <span>
                      Joined: <strong>{formatWhen(person.createdAt)}</strong>
                    </span>
                  </div>
                </div>

                <div className="session-actions">
                  {canEdit ? (
                    <Button variant="ghost" onClick={() => openEdit(person)}>
                      Edit
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setResettingFor(person);
                        setNewPassword('');
                      }}
                    >
                      Reset password
                    </Button>
                  ) : null}
                  {canDelete && !isSelf ? (
                    <Button
                      variant="danger"
                      onClick={() => void onDelete(person)}
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
          title={editingId ? 'Edit user' : 'Add user'}
          onClose={closeForm}
          onSubmit={(event) => void onSubmit(event)}
          footer={
            <>
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save changes' : 'Create user'}
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

            {editingId ? null : (
              <>
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
                  Temporary password
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                </label>
              </>
            )}

            <label>
              Role
              <select
                value={form.roleId}
                onChange={(event) =>
                  setForm({ ...form, roleId: event.target.value })
                }
                required
              >
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.displayName}
                  </option>
                ))}
              </select>
            </label>

            {editingId ? (
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as UserStatus,
                    })
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {resettingFor ? (
        <Modal
          title={`Reset password for ${resettingFor.firstName}`}
          onClose={() => setResettingFor(null)}
          onSubmit={(event) => void onResetPassword(event)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setResettingFor(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Reset password
              </Button>
            </>
          }
        >
          <p className="meta">
            {resettingFor.email} will be signed out everywhere and must use the
            new password to sign back in.
          </p>
          <div className="form-grid">
            <label className="span-2">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
