import { Module } from '@nestjs/common';
import { LiveInterviewModule } from '../live-interview/live-interview.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [LiveInterviewModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
