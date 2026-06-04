import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Session } from '../entities/session.entity';
import { JwtUser } from '../interfaces/request-with-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'venue_flow',
    });
  }

  async validate(payload: JwtUser): Promise<JwtUser> {
    const session = await this.sessionRepo.findOne({
      where: { id: payload.sessionId },
      select: ['id', 'isActive', 'expiresAt'],
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session has expired');
    }

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }
}
