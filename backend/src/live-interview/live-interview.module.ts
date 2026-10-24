import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CommonModule } from '../common/common.module';
import { LiveInterviewAccessService } from './live-interview-access.service';
import { LiveInterviewContextService } from './live-interview-context.service';
import { LiveInterviewController } from './live-interview.controller';
import { LiveInterviewFeedbackService } from './live-interview-feedback.service';
import { LiveInterviewGateway } from './live-interview.gateway';
import { LiveInterviewRecordingService } from './live-interview-recording.service';
import { LiveInterviewRoomService } from './live-interview-room.service';
import { LiveInterviewSessionService } from './live-interview-session.service';

@Module({
  imports: [
    CommonModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [LiveInterviewController],
  providers: [
    LiveInterviewContextService,
    LiveInterviewSessionService,
    LiveInterviewAccessService,
    LiveInterviewRoomService,
    LiveInterviewRecordingService,
    LiveInterviewFeedbackService,
    LiveInterviewGateway,
  ],
  exports: [
    LiveInterviewGateway,
    LiveInterviewContextService,
    LiveInterviewSessionService,
    LiveInterviewAccessService,
    LiveInterviewRoomService,
    LiveInterviewRecordingService,
    LiveInterviewFeedbackService,
  ],
})
export class LiveInterviewModule {}
