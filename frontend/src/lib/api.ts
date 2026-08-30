import { tokenStorage } from './tokenStorage';
import { guestSession } from './guestSession';
import { techGuestSession } from './techGuestSession';
import type { ApiResponse, AuthUser, LoginResponse } from '../types/auth';
import type {
  Candidate,
  CreateCandidateInput,
  UpdateCandidateInput,
} from '../types/candidate';
import type {
  DashboardOverview,
  ReportOverview,
  SettingsPayload,
} from '../types/insights';
import type {
  CreateInterviewInput,
  InterviewListFilters,
  InterviewSummaryStats,
  ManagedInterview,
  UpdateInterviewInput,
} from '../types/interview';
import type {
  CreateLiveInterviewInput,
  FeedbackInput,
  InterviewerOption,
  InvitePreview,
  LiveInterviewReview,
  LiveInterviewSession,
} from '../types/liveInterview';
import type {
  CreateQuestionInput,
  QuestionBankItem,
  UpdateQuestionInput,
} from '../types/questionBank';
import type {
  CreateTechnicalInterviewInput,
  GradeAnswerInput,
  SaveAnswerInput,
  TechInvitePreview,
  TechnicalInterviewSession,
  UpdateTechnicalInterviewInput,
} from '../types/technicalInterview';
import type {
  CreateUserInput,
  PlatformUser,
  RoleOption,
  UpdateUserInput,
} from '../types/user';

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export const SOCKET_BASE =
  import.meta.env.VITE_SOCKET_BASE_URL ?? 'http://localhost:3000';

function getBearerToken() {
  return (
    tokenStorage.getAccessToken() ||
    guestSession.getToken() ||
    techGuestSession.getToken()
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getBearerToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && auth && tokenStorage.getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set(
        'Authorization',
        `Bearer ${tokenStorage.getAccessToken() ?? ''}`,
      );
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    }
  }

  if (response.status === 401 && guestSession.getToken()) {
    guestSession.clear();
  }
  if (response.status === 401 && techGuestSession.getToken()) {
    techGuestSession.clear();
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Request failed.');
  }
  return payload;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = (await response.json()) as ApiResponse<LoginResponse>;
    if (!response.ok || !payload.success || !payload.data) {
      tokenStorage.clear();
      return false;
    }
    tokenStorage.setSession(
      payload.data.accessToken,
      payload.data.refreshToken,
      payload.data.user,
    );
    return true;
  } catch {
    tokenStorage.clear();
    return false;
  }
}

export const authApi = {
  login(email: string, password: string) {
    return request<LoginResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false,
    );
  },
  logout(refreshToken: string) {
    return request(
      '/auth/logout',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      },
      false,
    );
  },
  profile() {
    return request<LoginResponse['user']>('/auth/profile');
  },
  forgotPassword(email: string) {
    return request(
      '/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      false,
    );
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

export const liveInterviewApi = {
  list() {
    return request<LiveInterviewSession[]>('/live-interviews');
  },
  get(id: string) {
    return request<LiveInterviewSession>(`/live-interviews/${id}`);
  },
  interviewers() {
    return request<InterviewerOption[]>('/live-interviews/interviewers');
  },
  create(input: CreateLiveInterviewInput) {
    return request<LiveInterviewSession>('/live-interviews', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: Partial<CreateLiveInterviewInput>) {
    return request<LiveInterviewSession>(`/live-interviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  remove(id: string) {
    return request<{ deleted: boolean; id: string }>(`/live-interviews/${id}`, {
      method: 'DELETE',
    });
  },
  regenerateInvite(id: string) {
    return request<LiveInterviewSession>(
      `/live-interviews/${id}/regenerate-invite`,
      { method: 'POST' },
    );
  },
  invitePreview(token: string) {
    return request<InvitePreview>(`/live-interviews/invite/${token}`, {}, false);
  },
  enterAsGuest(token: string) {
    return request<{
      accessToken: string;
      liveInterviewId: string;
      lobbyPath: string;
      user: AuthUser & { isGuest: true; liveInterviewId: string };
    }>(`/live-interviews/invite/${token}/enter`, { method: 'POST' }, false);
  },
  join(id: string) {
    return request<LiveInterviewSession>(`/live-interviews/${id}/join`, {
      method: 'POST',
    });
  },
  mediaCheck(id: string, cameraOk: boolean, microphoneOk: boolean) {
    return request(`/live-interviews/${id}/media-check`, {
      method: 'POST',
      body: JSON.stringify({ cameraOk, microphoneOk }),
    });
  },
  start(id: string) {
    return request<LiveInterviewSession>(`/live-interviews/${id}/start`, {
      method: 'POST',
    });
  },
  toggleRecording(id: string, isRecording: boolean) {
    return request<LiveInterviewSession>(`/live-interviews/${id}/recording`, {
      method: 'POST',
      body: JSON.stringify({ isRecording }),
    });
  },
  submitFeedback(id: string, input: FeedbackInput) {
    return request(`/live-interviews/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  complete(id: string) {
    return request<LiveInterviewSession>(`/live-interviews/${id}/complete`, {
      method: 'POST',
    });
  },
  leave(id: string) {
    return request(`/live-interviews/${id}/leave`, { method: 'POST' });
  },
  review(id: string) {
    return request<LiveInterviewReview>(`/live-interviews/${id}/review`);
  },
  logEvent(id: string, eventType: string, message?: string) {
    return request(`/live-interviews/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, message }),
    });
  },
  uploadRecording(
    id: string,
    blob: Blob,
    meta: { label: string; durationSeconds: number },
  ) {
    const form = new FormData();
    form.append('file', blob, `interview-${id}.webm`);
    form.append('label', meta.label);
    form.append('durationSeconds', String(meta.durationSeconds));
    return request(`/live-interviews/${id}/recordings`, {
      method: 'POST',
      body: form,
    });
  },
  recordingStreamUrl(liveInterviewId: string, recordingId: string) {
    return `${API_BASE}/live-interviews/${liveInterviewId}/recordings/${recordingId}/stream`;
  },
};

export const dashboardApi = {
  overview() {
    return request<DashboardOverview>('/dashboard');
  },
};

function rangeQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const reportApi = {
  overview(from?: string, to?: string) {
    return request<ReportOverview>(`/reports/overview${rangeQuery(from, to)}`);
  },
  async downloadCsv(from?: string, to?: string) {
    const token = getBearerToken();
    const response = await fetch(
      `${API_BASE}/reports/export${rangeQuery(from, to)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
    if (!response.ok) {
      throw new Error('Export failed.');
    }
    return response.blob();
  },
};

export const settingsApi = {
  get() {
    return request<SettingsPayload>('/settings');
  },
  updateCompany(name: string) {
    return request<SettingsPayload>('/settings/company', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },
  updateProfile(firstName: string, lastName: string) {
    return request<SettingsPayload>('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify({ firstName, lastName }),
    });
  },
  createRole(input: {
    displayName: string;
    description?: string;
    permissionCodes: string[];
  }) {
    return request<SettingsPayload>('/settings/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateRole(
    id: string,
    input: {
      displayName?: string;
      description?: string;
      permissionCodes?: string[];
    },
  ) {
    return request<SettingsPayload>(`/settings/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  deleteRole(id: string) {
    return request<SettingsPayload>(`/settings/roles/${id}`, {
      method: 'DELETE',
    });
  },
};

export const candidateApi = {
  list(search?: string) {
    const query = search?.trim()
      ? `?search=${encodeURIComponent(search.trim())}`
      : '';
    return request<Candidate[]>(`/candidates${query}`);
  },
  get(id: string) {
    return request<Candidate>(`/candidates/${id}`);
  },
  create(input: CreateCandidateInput) {
    return request<Candidate>('/candidates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: UpdateCandidateInput) {
    return request<Candidate>(`/candidates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  remove(id: string) {
    return request<{ deleted: boolean; id: string }>(`/candidates/${id}`, {
      method: 'DELETE',
    });
  },
};

export const interviewApi = {
  list(filters: InterviewListFilters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.type) params.set('type', filters.type);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const query = params.toString();
    return request<ManagedInterview[]>(
      `/interviews${query ? `?${query}` : ''}`,
    );
  },
  summary() {
    return request<InterviewSummaryStats>('/interviews/summary');
  },
  interviewers() {
    return request<InterviewerOption[]>('/interviews/interviewers');
  },
  get(id: string) {
    return request<ManagedInterview>(`/interviews/${id}`);
  },
  create(input: CreateInterviewInput) {
    return request<ManagedInterview>('/interviews', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: UpdateInterviewInput) {
    return request<ManagedInterview>(`/interviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  cancel(id: string) {
    return request<ManagedInterview>(`/interviews/${id}/cancel`, {
      method: 'POST',
    });
  },
  remove(id: string) {
    return request<{ deleted: boolean; id: string }>(`/interviews/${id}`, {
      method: 'DELETE',
    });
  },
};

export const questionBankApi = {
  list() {
    return request<QuestionBankItem[]>('/question-bank');
  },
  get(id: string) {
    return request<QuestionBankItem>(`/question-bank/${id}`);
  },
  create(input: CreateQuestionInput) {
    return request<QuestionBankItem>('/question-bank', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: UpdateQuestionInput) {
    return request<QuestionBankItem>(`/question-bank/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  remove(id: string) {
    return request<{ deleted: boolean; id: string }>(`/question-bank/${id}`, {
      method: 'DELETE',
    });
  },
};

export const technicalInterviewApi = {
  list() {
    return request<TechnicalInterviewSession[]>('/technical-interviews');
  },
  get(id: string) {
    return request<TechnicalInterviewSession>(`/technical-interviews/${id}`);
  },
  interviewers() {
    return request<InterviewerOption[]>('/technical-interviews/interviewers');
  },
  create(input: CreateTechnicalInterviewInput) {
    return request<TechnicalInterviewSession>('/technical-interviews', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: UpdateTechnicalInterviewInput) {
    return request<TechnicalInterviewSession>(`/technical-interviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  remove(id: string) {
    return request<{ deleted: boolean; id: string }>(
      `/technical-interviews/${id}`,
      { method: 'DELETE' },
    );
  },
  regenerateInvite(id: string) {
    return request<TechnicalInterviewSession>(
      `/technical-interviews/${id}/regenerate-invite`,
      { method: 'POST' },
    );
  },
  invitePreview(token: string) {
    return request<TechInvitePreview>(
      `/technical-interviews/invite/${token}`,
      {},
      false,
    );
  },
  enterAsGuest(token: string) {
    return request<{
      accessToken: string;
      technicalInterviewId: string;
      takePath: string;
      user: AuthUser & { isGuest: true; technicalInterviewId: string };
    }>(
      `/technical-interviews/invite/${token}/enter`,
      { method: 'POST' },
      false,
    );
  },
  start(id: string) {
    return request<TechnicalInterviewSession>(
      `/technical-interviews/${id}/start`,
      { method: 'POST' },
    );
  },
  saveAnswers(id: string, answers: SaveAnswerInput[]) {
    return request<TechnicalInterviewSession>(
      `/technical-interviews/${id}/answers`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      },
    );
  },
  submit(id: string, answers: SaveAnswerInput[]) {
    return request<TechnicalInterviewSession>(
      `/technical-interviews/${id}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      },
    );
  },
  uploadFaceRecording(
    id: string,
    blob: Blob,
    meta: { label?: string; durationSeconds?: number },
  ) {
    const form = new FormData();
    form.append('file', blob, `face-${Date.now()}.webm`);
    if (meta.label) form.append('label', meta.label);
    if (meta.durationSeconds != null) {
      form.append('durationSeconds', String(meta.durationSeconds));
    }
    return request(`/technical-interviews/${id}/recordings`, {
      method: 'POST',
      body: form,
    });
  },
  recordingStreamUrl(technicalInterviewId: string, recordingId: string) {
    return `${API_BASE}/technical-interviews/${technicalInterviewId}/recordings/${recordingId}/stream`;
  },
  grade(id: string, input: GradeAnswerInput) {
    return request<TechnicalInterviewSession>(
      `/technical-interviews/${id}/grade`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
};

export const userApi = {
  list(search?: string, role?: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (role) params.set('role', role);
    const query = params.toString();
    return request<PlatformUser[]>(`/users${query ? `?${query}` : ''}`);
  },
  roles() {
    return request<RoleOption[]>('/users/roles');
  },
  create(input: CreateUserInput) {
    return request<PlatformUser>('/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, input: UpdateUserInput) {
    return request<PlatformUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  resetPassword(id: string, newPassword: string) {
    return request<{ id: string; passwordReset: boolean }>(
      `/users/${id}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      },
    );
  },
  remove(id: string) {
    return request<{ id: string; deleted: boolean }>(`/users/${id}`, {
      method: 'DELETE',
    });
  },
};