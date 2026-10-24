import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { LiveInterviewModule } from '../live-interview/live-interview.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [CommonModule, LiveInterviewModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
