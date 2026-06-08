import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventSeatStatus } from '../events/entities/enums/event-seat-status.enum';

// ─── Payload type emitted to clients ─────────────────────────────────────────

export interface SeatStatusUpdate {
  id: string;
  status: EventSeatStatus;
}

export interface SeatUpdatePayload {
  eventId: string;
  seats: SeatStatusUpdate[];
}

// ─── Internal socket meta attached after auth ─────────────────────────────────

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

// ─── Gateway ──────────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace: '/seats',
  cors: {
    origin: ['http://localhost:5173', 'https://venue-flow-fe-u7po.vercel.app'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class SeatsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SeatsGateway.name);

  @WebSocketServer()
  readonly server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: AuthenticatedSocket, next) => {
      try {
        const auth = socket.handshake.auth;
        const token =
          typeof auth?.token === 'string'
            ? auth.token
            : typeof socket.handshake.headers.authorization === 'string'
              ? socket.handshake.headers.authorization
                  .replace(/^Bearer\s+/i, '')
                  .trim()
              : undefined;

        if (!token) {
          return next(new WsException('Missing authentication token'));
        }

        const secret =
          this.configService.get<string>('JWT_SECRET') ?? 'venue_flow';

        interface JwtPayload {
          id: string;
          role: string;
          sessionId: string;
        }

        const payload: JwtPayload = this.jwtService.verify<JwtPayload>(token, {
          secret,
        });

        socket.userId = payload.id;
        socket.userRole = payload.role;

        next();
      } catch {
        next(new WsException('Invalid or expired token'));
      }
    });

    this.logger.log('SeatsGateway initialized — JWT middleware attached');
  }

  handleConnection(client: AuthenticatedSocket): void {
    this.logger.log(
      `Client connected: ${client.id} (userId=${client.userId ?? 'unknown'})`,
    );
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(
      `Client disconnected: ${client.id} (userId=${client.userId ?? 'unknown'})`,
    );
  }

  // ── Room management ──────────────────────────────────────────────────────

  /**
   * Client emits:  { eventId: "<uuid>" }
   * Server joins the socket into room "event:<eventId>"
   */
  @SubscribeMessage('join:event')
  async handleJoinEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: string },
  ): Promise<{ status: 'ok'; room: string }> {
    const room = `event:${data.eventId}`;
    await client.join(room);
    this.logger.debug(`${client.id} joined ${room}`);
    return { status: 'ok', room };
  }

  /**
   * Client emits:  { eventId: "<uuid>" }
   * Server removes the socket from room "event:<eventId>"
   */
  @SubscribeMessage('leave:event')
  async handleLeaveEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: string },
  ): Promise<{ status: 'ok'; room: string }> {
    const room = `event:${data.eventId}`;
    await client.leave(room);
    this.logger.debug(`${client.id} left ${room}`);
    return { status: 'ok', room };
  }

  // ── Broadcast helpers (called by services) ────────────────────────────────

  /**
   * Broadcast seat status changes to every client watching this event.
   * Services call this method directly after every DB mutation.
   */
  broadcastSeatUpdate(payload: SeatUpdatePayload): void {
    const room = `event:${payload.eventId}`;
    this.server.to(room).emit('seat:update', payload);
    this.logger.debug(
      `Broadcasted ${payload.seats.length} seat update(s) to room ${room}`,
    );
  }
}
