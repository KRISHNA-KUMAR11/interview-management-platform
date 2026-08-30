import { InterviewStatus, InterviewType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListInterviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @IsOptional()
  @IsEnum(InterviewType)
  type?: InterviewType;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateInterviewDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsEnum(InterviewType)
  type: InterviewType;

  @IsDateString()
  scheduledAt: string;

  @IsDateString()
  endsAt: string;

  @IsUUID()
  interviewerId: string;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

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
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  timeLimitMinutes?: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds?: string[];
}

export class UpdateInterviewDto {
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
  @IsUUID()
  interviewerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;
}
