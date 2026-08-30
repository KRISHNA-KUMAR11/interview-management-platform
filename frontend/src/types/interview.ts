import type { InterviewStatus } from './liveInterview';
import type { TechnicalAttemptStatus } from './technicalInterview';

export type { InterviewStatus };

export type InterviewType = 'LIVE' | 'TECHNICAL' | 'COMBINED';

export interface InterviewSummaryStats {
  total: number;
  scheduled: number;
  waiting: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  today: number;
}

export interface ManagedInterview {
  id: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  notes: string | null;
  windowOpen: boolean;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  interviewer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  liveSession: {
    id: string;
    roomCode: string;
    inviteToken: string;
  } | null;
  technicalSession: {
    id: string;
    inviteToken: string;
    attemptStatus: TechnicalAttemptStatus;
    totalScore: number | null;
    maxScore: number;
    timeLimitMinutes: number;
  } | null;
  feedbackCount: number;
  averageRating: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInterviewInput {
  title: string;
  type: InterviewType;
  scheduledAt: string;
  endsAt: string;
  interviewerId: string;
  candidateId?: string;
  candidateFirstName?: string;
  candidateLastName?: string;
  candidateEmail?: string;
  notes?: string;
  recordingEnabled?: boolean;
  timeLimitMinutes?: number;
  instructions?: string;
  questionIds?: string[];
}

export interface UpdateInterviewInput {
  title?: string;
  scheduledAt?: string;
  endsAt?: string;
  interviewerId?: string;
  notes?: string;
  status?: InterviewStatus;
}

export interface InterviewListFilters {
  status?: InterviewStatus | '';
  type?: InterviewType | '';
  search?: string;
}
