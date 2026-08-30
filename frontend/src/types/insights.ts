import type { InterviewStatus, InterviewType } from './interview';
import type { TechnicalAttemptStatus } from './technicalInterview';

export interface DashboardRow {
  id: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string;
  endsAt: string;
  windowOpen: boolean;
  candidateName: string;
  candidateEmail: string;
  interviewerName: string;
  liveInterviewId: string | null;
  technicalInterviewId: string | null;
  technicalAttemptStatus: TechnicalAttemptStatus | null;
  rating: number | null;
}

export interface DashboardActivity {
  id: string;
  eventType: string;
  message: string | null;
  interviewTitle: string;
  liveInterviewId: string;
  actorName: string;
  createdAt: string;
}

export interface DashboardOverview {
  stats: {
    totalInterviews: number;
    upcoming: number;
    today: number;
    completedThisWeek: number;
    candidates: number;
    questions: number;
    pendingReviews: number;
  };
  upcoming: DashboardRow[];
  recent: DashboardRow[];
  activity: DashboardActivity[];
}

export type HireRecommendation = 'HIRE' | 'NO_HIRE' | 'MAYBE';

export interface ReportOverview {
  range: { from: string; to: string };
  totals: {
    interviews: number;
    completed: number;
    cancelled: number;
    completionRate: number;
    avgRating: number | null;
    feedbackCount: number;
    avgDurationMinutes: number;
  };
  byStatus: Array<{ status: InterviewStatus; count: number }>;
  byType: Array<{ type: InterviewType; count: number }>;
  byMonth: Array<{
    month: string;
    label: string;
    total: number;
    completed: number;
  }>;
  recommendations: Array<{
    recommendation: HireRecommendation;
    count: number;
  }>;
  interviewers: Array<{
    id: string;
    name: string;
    total: number;
    completed: number;
    avgRating: number | null;
  }>;
  technical: {
    total: number;
    submitted: number;
    expired: number;
    notStarted: number;
    avgScorePct: number | null;
  };
}

export interface SettingsPayload {
  profile: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
    roleName: string;
    roleDisplayName: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    counts: {
      users: number;
      candidates: number;
      interviews: number;
      questions: number;
    };
  } | null;
  roles: Array<{
    id: string;
    name: string;
    displayName: string;
    description: string | null;
    isSystem: boolean;
    userCount: number;
    permissionCount: number;
    permissionCodes: string[];
  }>;
  availablePermissions: Array<{
    code: string;
    module: string;
    action: string;
    description: string | null;
  }>;
  permissions: string[];
  canEditCompany: boolean;
  canManageRoles: boolean;
}
