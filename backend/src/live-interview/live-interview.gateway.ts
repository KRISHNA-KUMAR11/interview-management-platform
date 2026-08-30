import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface SocketUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/live',
})
export class LiveInterviewGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        type?: string;
        liveInterviewId?: string;
        inviteToken?: string;
        firstName?: string;
        lastName?: string;
      }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (payload.type === 'guest') {
        const live = await this.prisma.liveInterview.findUnique({
          where: { id: payload.liveInterviewId },
          include: { interview: true },
        });
        if (
          !live ||
          live.invite_token !== payload.inviteToken ||
          live.interview.status === 'COMPLETED' ||
          live.interview.status === 'CANCELLED'
        ) {
          client.disconnect(true);
          return;
        }

        const now = Date.now();
        if (
          now < live.interview.scheduled_at.getTime() ||
          now > live.interview.ends_at.getTime()
        ) {
          client.disconnect(true);
          return;
        }

        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            status: true,
          },
        });
        if (!user || user.status !== 'ACTIVE') {
          client.disconnect(true);
          return;
        }

        client.data.user = {
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        } satisfies SocketUser;
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          status: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        client.disconnect(true);
        return;
      }

      const socketUser: SocketUser = {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      };
      client.data.user = socketUser;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('room:join')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomCode: string; liveInterviewId: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.roomCode) {
      return { ok: false };
    }

    const room = `live:${body.roomCode}`;
    await client.join(room);

    client.to(room).emit('peer:joined', {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      socketId: client.id,
    });

    const sockets = await this.server.in(room).fetchSockets();
    const peers = sockets
      .filter((s) => s.id !== client.id)
      .map((s) => {
        const peerUser = s.data.user as SocketUser;
        return {
          userId: peerUser?.userId,
          firstName: peerUser?.firstName,
          lastName: peerUser?.lastName,
          socketId: s.id,
        };
      });

    return { ok: true, peers };
  }

  @SubscribeMessage('signal:offer')
  relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { to: string; roomCode: string; sdp: Record<string, unknown> },
  ) {
    this.server.to(body.to).emit('signal:offer', {
      from: client.id,
      sdp: body.sdp,
      user: client.data.user,
    });
  }

  @SubscribeMessage('signal:answer')
  relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { to: string; roomCode: string; sdp: Record<string, unknown> },
  ) {
    this.server.to(body.to).emit('signal:answer', {
      from: client.id,
      sdp: body.sdp,
      user: client.data.user,
    });
  }

  @SubscribeMessage('signal:ice')
  relayIce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { to: string; roomCode: string; candidate: Record<string, unknown> },
  ) {
    this.server.to(body.to).emit('signal:ice', {
      from: client.id,
      candidate: body.candidate,
    });
  }

  @SubscribeMessage('room:leave')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomCode: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    const room = `live:${body.roomCode}`;
    client.to(room).emit('peer:left', {
      userId: user?.userId,
      socketId: client.id,
    });
    await client.leave(room);
    return { ok: true };
  }

  @SubscribeMessage('session:event')
  broadcastSessionEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { roomCode: string; type: string; payload?: Record<string, unknown> },
  ) {
    const room = `live:${body.roomCode}`;
    client.to(room).emit('session:event', {
      type: body.type,
      payload: body.payload,
      from: client.data.user,
    });
  }
}
