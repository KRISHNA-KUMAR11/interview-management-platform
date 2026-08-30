export type QuestionType = 'MCQ' | 'SHORT_ANSWER' | 'CODING';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface McqOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface QuestionBankItem {
  id: string;
  companyId: string;
  title: string;
  body: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  language?: string | null;
  points: number;
  starterCode?: string | null;
  options: McqOption[];
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestionInput {
  title: string;
  body: string;
  type: QuestionType;
  difficulty?: QuestionDifficulty;
  language?: string;
  points?: number;
  options?: McqOption[];
  starterCode?: string;
}

export type UpdateQuestionInput = Partial<CreateQuestionInput>;
