import type { InterviewStatus } from './liveInterview';
import type { McqOption, QuestionDifficulty, QuestionType } from './questionBank';

export type TechnicalAttemptStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'REVIEWED'
  | 'EXPIRED';

export interface TechnicalQuestionLink {
  id: string;
  questionId: string;
  sortOrder: number;
  points: number;
  question: {
    id: string;
    title: string;
    body: string;
    type: QuestionType;
    difficulty: QuestionDifficulty;
    language?: string | null;
    starterCode?: string | null;
    options: McqOption[];
  };
}

export interface TechnicalAnswer {
  id: string;
  questionId: string;
  answerText?: string | null;
  selectedOptionId?: string | null;
  code?: string | null;
  score?: number | null;
  feedback?: string | null;
}

export interface TechnicalInterviewSession {
  id: string;
  inviteToken: string;
  candidateJoinUrl: string;
  timeLimitMinutes: number;
  instructions?: string | null;
  attemptStatus: TechnicalAttemptStatus;
  startedAt?: string | null;
  submittedAt?: string | null;
  totalScore?: number | null;
  maxScore: number;
  remainingSeconds: number;
  interview: {
    id: string;
    title: string;
    status: InterviewStatus;
    scheduledAt: string;
    endsAt: string;
    durationMinutes: number;
    notes?: string | null;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      userId?: string | null;
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
      email: string;
    };
  };
  questions: TechnicalQuestionLink[];
  answers: TechnicalAnswer[];
  recordings?: TechnicalRecording[];
}

export interface TechnicalRecording {
  id: string;
  label: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
  createdAt: string;
  recordedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  streamUrl: string;
}

export interface TechInvitePreview {
  id: string;
  inviteToken: string;
  candidateJoinUrl: string;
  timeLimitMinutes: number;
  instructions?: string | null;
  attemptStatus: TechnicalAttemptStatus;
  maxScore: number;
  questionCount: number;
  interview: {
    title: string;
    status: InterviewStatus;
    scheduledAt: string;
    endsAt: string;
    candidate: {
      firstName: string;
      lastName: string;
    };
    interviewer: {
      firstName: string;
      lastName: string;
    };
  };
}

export interface CreateTechnicalInterviewInput {
  title: string;
  scheduledAt: string;
  endsAt: string;
  timeLimitMinutes: number;
  interviewerId: string;
  candidateFirstName?: string;
  candidateLastName?: string;
  candidateEmail?: string;
  questionIds: string[];
  instructions?: string;
  notes?: string;
}

export type UpdateTechnicalInterviewInput = Partial<CreateTechnicalInterviewInput>;

export interface SaveAnswerInput {
  questionId: string;
  answerText?: string;
  selectedOptionId?: string;
  code?: string;
}

export interface GradeAnswerInput {
  questionId: string;
  score: number;
  feedback?: string;
}
