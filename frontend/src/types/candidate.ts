import type { InterviewStatus, InterviewType } from './interview';
import type { TechnicalAttemptStatus } from './technicalInterview';

export interface CandidateInterviewSummary {
  id: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string;
  endsAt: string;
  interviewerName: string;
  liveInterviewId: string | null;
  technicalInterviewId: string | null;
  technicalAttemptStatus: TechnicalAttemptStatus | null;
}

export interface Candidate {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  hasLogin: boolean;
  createdAt: string;
  updatedAt: string;
  stats: {
    total: number;
    completed: number;
    upcoming: number;
  };
  nextInterviewAt: string | null;
  interviews: CandidateInterviewSummary[];
}

export interface CreateCandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export type UpdateCandidateInput = Partial<CreateCandidateInput>;
