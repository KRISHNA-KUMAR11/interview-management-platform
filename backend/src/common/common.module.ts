import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GuestAccessService } from './guest-access.service';
import { IceServerService } from './ice-server.service';
import { MailService } from './mail.service';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [
    GuestAccessService,
    IceServerService,
    MailService,
    ObjectStorageService,
  ],
  exports: [
    GuestAccessService,
    IceServerService,
    MailService,
    ObjectStorageService,
  ],
})
export class CommonModule {}
