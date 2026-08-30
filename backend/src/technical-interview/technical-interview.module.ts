import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TechnicalInterviewAccessService } from './technical-interview-access.service';
import { TechnicalInterviewAssessmentService } from './technical-interview-assessment.service';
import { TechnicalInterviewAttemptService } from './technical-interview-attempt.service';
import { TechnicalInterviewContextService } from './technical-interview-context.service';
import { TechnicalInterviewController } from './technical-interview.controller';
import { TechnicalInterviewRecordingService } from './technical-interview-recording.service';
import { TechnicalInterviewReviewService } from './technical-interview-review.service';

@Module({
  imports: [CommonModule],
  controllers: [TechnicalInterviewController],
  providers: [
    TechnicalInterviewContextService,
    TechnicalInterviewAssessmentService,
    TechnicalInterviewAccessService,
    TechnicalInterviewAttemptService,
    TechnicalInterviewReviewService,
    TechnicalInterviewRecordingService,
  ],
  exports: [
    TechnicalInterviewContextService,
    TechnicalInterviewAssessmentService,
    TechnicalInterviewAccessService,
    TechnicalInterviewAttemptService,
    TechnicalInterviewReviewService,
    TechnicalInterviewRecordingService,
  ],
})
export class TechnicalInterviewModule {}
