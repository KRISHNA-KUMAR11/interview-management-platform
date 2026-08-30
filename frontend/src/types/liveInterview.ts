export type InterviewStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ParticipantRole = 'INTERVIEWER' | 'CANDIDATE' | 'OBSERVER';
export type HireRecommendation = 'HIRE' | 'NO_HIRE' | 'MAYBE';

export interface LiveParticipant {
  id: string;
  role: ParticipantRole;
  cameraOk: boolean;
  microphoneOk: boolean;
  mediaCheckPassed: boolean;
  joinedAt?: string | null;
  leftAt?: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface LiveInterviewSession {
  id: string;
  roomCode: string;
  inviteToken: string;
  candidateJoinUrl: string;
  recordingEnabled: boolean;
  isRecording: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
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
    feedback: Array<{
      id: string;
      rating: number;
      recommendation: HireRecommendation;
      strengths?: string | null;
      weaknesses?: string | null;
      comments?: string | null;
      submittedAt: string;
      submittedBy: {
        id: string;
        firstName: string;
        lastName: string;
      };
    }>;
  };
  participants: LiveParticipant[];
}

export interface InvitePreview {
  id: string;
  roomCode: string;
  inviteToken: string;
  candidateJoinUrl: string;
  interview: {
    title: string;
    status: InterviewStatus;
    scheduledAt: string;
    endsAt: string;
    durationMinutes: number;
    candidate: {
      firstName: string;
      lastName: string;
      email: string;
    };
    interviewer: {
      firstName: string;
      lastName: string;
    };
  };
}

export interface LiveRecording {
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

export interface LiveEvent {
  id: string;
  eventType: string;
  message?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface LiveInterviewReview extends LiveInterviewSession {
  recordings: LiveRecording[];
  events: LiveEvent[];
}

export interface InterviewerOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: { displayName: string };
}

export interface CreateLiveInterviewInput {
  title: string;
  scheduledAt: string;
  endsAt: string;
  durationMinutes?: number;
  interviewerId: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string;
  recordingEnabled?: boolean;
  notes?: string;
}

export interface FeedbackInput {
  rating: number;
  recommendation: HireRecommendation;
  strengths?: string;
  weaknesses?: string;
  comments?: string;
}
