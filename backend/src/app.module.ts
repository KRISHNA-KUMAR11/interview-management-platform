import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { InterviewsModule } from './interviews/interviews.module';
import { LiveInterviewModule } from './live-interview/live-interview.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { TechnicalInterviewModule } from './technical-interview/technical-interview.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    CandidatesModule,
    DashboardModule,
    InterviewsModule,
    LiveInterviewModule,
    QuestionBankModule,
    ReportsModule,
    SettingsModule,
    TechnicalInterviewModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
