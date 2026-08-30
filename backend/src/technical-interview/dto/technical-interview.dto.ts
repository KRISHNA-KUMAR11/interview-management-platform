import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTechnicalInterviewDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsDateString()
  scheduledAt: string;

  @IsDateString()
  endsAt: string;

  @IsInt()
  @Min(15)
  @Max(240)
  timeLimitMinutes: number;

  @IsUUID()
  interviewerId: string;

  @IsOptional()
  @IsString()
  candidateFirstName?: string;

  @IsOptional()
  @IsString()
  candidateLastName?: string;

  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds: string[];

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTechnicalInterviewDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  timeLimitMinutes?: number;

  @IsOptional()
  @IsUUID()
  interviewerId?: string;

  @IsOptional()
  @IsString()
  candidateFirstName?: string;

  @IsOptional()
  @IsString()
  candidateLastName?: string;

  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds?: string[];

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SaveAnswerDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class SubmitAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerDto)
  answers: SaveAnswerDto[];
}

export class GradeAnswerDto {
  @IsUUID()
  questionId: string;

  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
