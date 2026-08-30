import {
  IsBoolean,
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
} from 'class-validator';
import { HireRecommendation } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateLiveInterviewDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsDateString()
  scheduledAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @IsUUID()
  interviewerId: string;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  candidateFirstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  candidateLastName?: string;

  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLiveInterviewDto {
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
  durationMinutes?: number;

  @IsOptional()
  @IsUUID()
  interviewerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  candidateFirstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  candidateLastName?: string;

  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MediaCheckDto {
  @IsBoolean()
  cameraOk: boolean;

  @IsBoolean()
  microphoneOk: boolean;
}

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsEnum(HireRecommendation)
  recommendation: HireRecommendation;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  weaknesses?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class ToggleRecordingDto {
  @IsBoolean()
  isRecording: boolean;
}

export class LogEventDto {
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsOptional()
  @IsString()
  message?: string;
}
