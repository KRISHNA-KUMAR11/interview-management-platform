import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildIceServers, IceServerConfig } from './ice-servers';

@Injectable()
export class IceServerService {
  constructor(private readonly configService: ConfigService) {}

  list(): IceServerConfig[] {
    return buildIceServers({
      stunUrls: this.configService.get<string>('STUN_URLS'),
      turnUrls: this.configService.get<string>('TURN_URLS'),
      turnUsername: this.configService.get<string>('TURN_USERNAME'),
      turnPassword: this.configService.get<string>('TURN_PASSWORD'),
    });
  }
}
