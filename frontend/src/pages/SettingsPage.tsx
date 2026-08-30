import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  Button,
  EmptyState,
  Modal,
  SkeletonList,
  StatusPill,
  useToast,
} from '../components/ui';
import { useAsyncData } from '../hooks/useAsyncData';
import { authApi, settingsApi } from '../lib/api';
import { formatWhen, titleCase } from '../lib/format';
import type { SettingsPayload } from '../types/insights';

type Tab = 'profile' | 'company' | 'security' | 'access';
type RoleDraft = {
  id: string | null;
  displayName: string;
  description: string;
  permissionCodes: string[];
};

const EMPTY_ROLE: RoleDraft = {
  id: null,
  displayName: '',
  description: '',
  permissionCodes: [],
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'company', label: 'Company' },
  { id: 'security', label: 'Security' },
  { id: 'access', label: 'Roles & access' },
];

export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleForm, setRoleForm] = useState<RoleDraft | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  const seedForm = useCallback((payload: SettingsPayload) => {
    setFirstName(payload.profile.firstName);
    setLastName(payload.profile.lastName);
    setCompanyName(payload.company?.name ?? '');
  }, []);

  const { data, loading, error, reload, setData } = useAsyncData(
    useCallback(async () => {
      const response = await settingsApi.get();
      const payload = response.data ?? null;
      if (payload) seedForm(payload);
      return payload;
    }, [seedForm]),
    [],
  );

  const applyData = (payload: SettingsPayload) => {
    setData(() => payload);
    seedForm(payload);
  };

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await settingsApi.updateProfile(firstName, lastName);
      if (response.data) applyData(response.data);
      toast.success(
        'Profile updated. Sign out and back in to refresh your name everywhere.',
      );
    } catch (err) {
      toast.error(
        'Update failed.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onSaveCompany = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await settingsApi.updateCompany(companyName);
      if (response.data) applyData(response.data);
      toast.success('Company updated.');
    } catch (err) {
      toast.error(
        'Update failed.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(
        'Password change failed.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, SettingsPayload['availablePermissions']>();
    for (const permission of data?.availablePermissions ?? []) {
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return [...groups.entries()];
  }, [data?.availablePermissions]);

  const togglePermission = (code: string) => {
    setRoleForm((current) => {
      if (!current) return current;
      const selected = current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((item) => item !== code)
        : [...current.permissionCodes, code];
      return { ...current, permissionCodes: selected };
    });
  };

  const toggleModule = (codes: string[]) => {
    setRoleForm((current) => {
      if (!current) return current;
      const allOn = codes.every((code) =>
        current.permissionCodes.includes(code),
      );
      const next = allOn
        ? current.permissionCodes.filter((code) => !codes.includes(code))
        : [...new Set([...current.permissionCodes, ...codes])];
      return { ...current, permissionCodes: next };
    });
  };

  const openCreateRole = () => {
    setRoleForm({ ...EMPTY_ROLE });
  };

  const openEditRole = (role: SettingsPayload['roles'][number]) => {
    setRoleForm({
      id: role.id,
      displayName: role.displayName,
      description: role.description ?? '',
      permissionCodes: [...role.permissionCodes],
    });
  };

  const onSaveRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!roleForm) return;
    if (roleForm.permissionCodes.length === 0) {
      toast.error('Select at least one permission.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        displayName: roleForm.displayName.trim(),
        description: roleForm.description.trim() || undefined,
        permissionCodes: roleForm.permissionCodes,
      };
      const response = roleForm.id
        ? await settingsApi.updateRole(roleForm.id, payload)
        : await settingsApi.createRole(payload);
      if (response.data) applyData(response.data);
      toast.success(roleForm.id ? 'Role updated.' : 'Role created.');
      setRoleForm(null);
    } catch (err) {
      toast.error(
        'Could not save role.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const onDeleteRole = async (id: string) => {
    setDeletingRoleId(id);
    try {
      const response = await settingsApi.deleteRole(id);
      if (response.data) applyData(response.data);
      toast.success('Role deleted.');
    } catch (err) {
      toast.error(
        'Could not delete role.',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setDeletingRoleId(null);
    }
  };

  if (loading) {
    return (
      <section className="page">
        <SkeletonList rows={3} />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page">
        <div className="alert" role="alert">
          {error || 'Settings unavailable.'}
          <Button variant="link" onClick={reload}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="page live-page">
      <header className="page-header">
        <p className="eyebrow">Settings</p>
        <h1>Workspace settings</h1>
        <p className="lede">
          Manage your profile, company details, password, and create your own
          roles with the permissions you choose.
        </p>
      </header>

      <div className="tab-bar" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'tab on' : 'tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <form
          className="side-card form-card"
          onSubmit={(e) => void onSaveProfile(e)}
        >
          <h2>Your profile</h2>
          <div className="form-grid">
            <label>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label>
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>
            <label>
              Email
              <input value={data.profile.email} readOnly />
            </label>
            <label>
              Role
              <input value={data.profile.roleDisplayName} readOnly />
            </label>
          </div>
          <p className="meta">
            Account created {formatWhen(data.profile.createdAt)} · Last sign-in{' '}
            {formatWhen(data.profile.lastLoginAt)}
          </p>
          <div className="form-actions">
            <Button type="submit" loading={saving}>
              Save profile
            </Button>
          </div>
        </form>
      ) : null}

      {tab === 'company' ? (
        data.company ? (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <span>Users</span>
                <strong>{data.company.counts.users}</strong>
              </div>
              <div className="stat-card">
                <span>Candidates</span>
                <strong>{data.company.counts.candidates}</strong>
              </div>
              <div className="stat-card">
                <span>Interviews</span>
                <strong>{data.company.counts.interviews}</strong>
              </div>
              <div className="stat-card">
                <span>Questions</span>
                <strong>{data.company.counts.questions}</strong>
              </div>
            </div>

            <form
              className="side-card form-card"
              onSubmit={(e) => void onSaveCompany(e)}
            >
              <h2>Company details</h2>
              <div className="form-grid">
                <label className="full">
                  Company name
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    minLength={2}
                    disabled={!data.canEditCompany}
                  />
                </label>
                <label>
                  Slug
                  <input value={data.company.slug} readOnly />
                </label>
                <label>
                  Created
                  <input value={formatWhen(data.company.createdAt)} readOnly />
                </label>
              </div>
              {data.canEditCompany ? (
                <div className="form-actions">
                  <Button type="submit" loading={saving}>
                    Save company
                  </Button>
                </div>
              ) : (
                <p className="meta">
                  You need the Settings.Edit permission to change these details.
                </p>
              )}
            </form>
          </>
        ) : (
          <EmptyState
            title="No company linked"
            description="Super admin accounts are not scoped to a company, so there is nothing to edit here."
          />
        )
      ) : null}

      {tab === 'security' ? (
        <form
          className="side-card form-card"
          onSubmit={(e) => void onChangePassword(e)}
        >
          <h2>Change password</h2>
          <div className="form-grid">
            <label className="full">
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
          </div>
          <p className="meta">
            Use at least 8 characters with a mix of letters, numbers, and
            symbols.
          </p>
          <div className="form-actions">
            <Button type="submit" loading={saving}>
              Change password
            </Button>
          </div>
        </form>
      ) : null}

      {tab === 'access' ? (
        <>
          <section className="side-card">
            <div className="section-head">
              <h2>Roles</h2>
              {data.canManageRoles ? (
                <Button type="button" onClick={openCreateRole}>
                  Create role
                </Button>
              ) : (
                <p className="meta">
                  You need Settings.Edit to create or change roles.
                </p>
              )}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Users</th>
                  <th>Permissions</th>
                  {data.canManageRoles ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {data.roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <strong>{role.displayName}</strong>
                      {role.isSystem ? <StatusPill>Built-in</StatusPill> : null}
                      {role.name === data.profile.roleName ? (
                        <StatusPill> You</StatusPill>
                      ) : null}
                    </td>
                    <td className="meta">{role.description ?? '—'}</td>
                    <td>{role.userCount}</td>
                    <td>{role.permissionCount}</td>
                    {data.canManageRoles ? (
                      <td className="table-actions">
                        {role.isSystem ? (
                          <span className="meta">Locked</span>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => openEditRole(role)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => void onDeleteRole(role.id)}
                              loading={deletingRoleId === role.id}
                              disabled={role.userCount > 0}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="side-card">
            <h2>Your permissions ({data.permissions.length})</h2>
            <div className="permission-chips">
              {data.permissions.map((permission) => (
                <span key={permission} className="chip">
                  {titleCase(permission.replace('.', '_'))}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {roleForm ? (
        <Modal
          title={roleForm.id ? 'Edit role' : 'Create role'}
          onClose={() => setRoleForm(null)}
          onSubmit={(event) => void onSaveRole(event)}
          wide
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRoleForm(null)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {roleForm.id ? 'Save role' : 'Create role'}
              </Button>
            </>
          }
        >
          <p className="meta">
            Built-in roles stay as they are. Your role can mix any of the
            permissions below.
          </p>
          <div className="form-grid">
            <label>
              Display name
              <input
                value={roleForm.displayName}
                onChange={(event) =>
                  setRoleForm((current) =>
                    current
                      ? { ...current, displayName: event.target.value }
                      : current,
                  )
                }
                required
                minLength={2}
                placeholder="Hiring Manager"
              />
            </label>
            <label className="full">
              Description
              <input
                value={roleForm.description}
                onChange={(event) =>
                  setRoleForm((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                placeholder="What this role is for"
              />
            </label>
          </div>
          <div className="permission-picker">
            {groupedPermissions.map(([module, permissions]) => {
              const codes = permissions.map((item) => item.code);
              const selectedCount = codes.filter((code) =>
                roleForm.permissionCodes.includes(code),
              ).length;
              return (
                <fieldset key={module} className="permission-module">
                  <legend>
                    <button
                      type="button"
                      className="ghost-btn sm"
                      onClick={() => toggleModule(codes)}
                    >
                      {module} ({selectedCount}/{codes.length})
                    </button>
                  </legend>
                  {permissions.map((permission) => (
                    <label key={permission.code} className="permission-option">
                      <input
                        type="checkbox"
                        checked={roleForm.permissionCodes.includes(
                          permission.code,
                        )}
                        onChange={() => togglePermission(permission.code)}
                      />
                      <span>
                        <strong>{permission.action}</strong>
                        <span className="meta">
                          {permission.description ?? permission.code}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
