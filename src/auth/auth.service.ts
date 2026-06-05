import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { AuthProvider, User, UserRole } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from './entities/session.entity';
import { JwtUser } from './interfaces/request-with-user.interface';

const SELECTOR_BYTES = 16; // 32 hex chars
const VERIFIER_BYTES = 48; // 96 hex chars
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  async register(registerDto: RegisterDto) {
    return await this.usersService.create(registerDto);
  }

  async validateUser(email: string, pass: string): Promise<User | null> {
    if (!email || !pass) {
      throw new ConflictException('Email and password are required');
    }
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    // Google-only accounts have no password — tell the user explicitly
    if (!user.passwordHash || user.authProvider === AuthProvider.GOOGLE) {
      throw new ConflictException(
        'This account uses Google login. Please sign in with Google.',
      );
    }

    if (await bcrypt.compare(pass, user.passwordHash)) {
      return user;
    }
    return null;
  }

  async login(
    user: User,
    req: Request,
  ): Promise<{
    accessToken: string;
    rawRefreshToken: string;
    user: { id: string; email: string; role: UserRole; name?: string };
  }> {
    await this.usersService.updateLastLogin(user.id);

    const session = new Session();
    session.user = { id: user.id } as User;
    session.userAgent = req.headers['user-agent'] ?? undefined;
    session.ipAddress = req.ip ?? undefined;
    session.isActive = true;
    session.expiresAt = this.getRefreshExpiry();
    const savedSession = await this.sessionRepo.save(session);

    const { rawToken, accessToken } = await this.generateTokenPair(
      savedSession,
      user,
    );

    return {
      accessToken,
      rawRefreshToken: rawToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? '',
      },
    };
  }

  async refresh(
    rawToken: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string }> {
    if (
      !rawToken ||
      rawToken.length !== SELECTOR_BYTES * 2 + VERIFIER_BYTES * 2
    ) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const selector = rawToken.slice(0, SELECTOR_BYTES * 2); // first 32 chars
    const verifier = rawToken.slice(SELECTOR_BYTES * 2); // last 96 chars

    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { tokenSelector: selector },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (tokenRecord.isUsed) {
      await this.killSession(tokenRecord.sessionId);
      throw new ForbiddenException(
        'Your session has expired or been revoked. Please log in again',
      );
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.killSession(tokenRecord.sessionId);
      throw new UnauthorizedException('Refresh token expired');
    }

    const verifierValid = await bcrypt.compare(verifier, tokenRecord.tokenHash);
    if (!verifierValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionRepo.findOne({
      where: { id: tokenRecord.sessionId },
      relations: { user: true },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session is no longer active');
    }

    if (session.expiresAt < new Date()) {
      await this.killSession(session.id);
      throw new UnauthorizedException('Session expired — please log in again');
    }

    await this.refreshTokenRepo.update(tokenRecord.id, { isUsed: true });

    const { rawToken: newRaw, accessToken } = await this.generateTokenPair(
      session,
      session.user,
    );

    return { accessToken, rawRefreshToken: newRaw };
  }

  async logout(sessionId: string): Promise<void> {
    await this.killSession(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .where(`user_id = :userId AND is_active = true`, { userId })
      .execute();

    await this.refreshTokenRepo
      .createQueryBuilder()
      .update()
      .set({ isUsed: true })
      .where(
        `session_id IN (
        SELECT id FROM sessions WHERE user_id = :userId
      )`,
        { userId },
      )
      .andWhere('is_used = false')
      .execute();
  }

  async getActiveSessions(userId: string): Promise<Session[]> {
    return this.sessionRepo.find({
      where: {
        user: {
          id: userId,
        },
        isActive: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async generateTokenPair(
    session: Session,
    user: User,
  ): Promise<{ rawToken: string; accessToken: string }> {
    const selectorBuf = crypto.randomBytes(SELECTOR_BYTES);
    const verifierBuf = crypto.randomBytes(VERIFIER_BYTES);

    const selector = selectorBuf.toString('hex'); // 32 chars
    const verifier = verifierBuf.toString('hex'); // 96 chars
    const rawToken = selector + verifier; // 128 chars — sent to client

    // Hash only the verifier — selector is safe in plaintext
    const tokenHash = await bcrypt.hash(verifier, BCRYPT_ROUNDS);

    const rt = new RefreshToken();
    rt.session = { id: session.id } as Session;
    rt.tokenSelector = selector;
    rt.tokenHash = tokenHash;
    rt.isUsed = false;
    rt.expiresAt = this.getRefreshExpiry();
    await this.refreshTokenRepo.save(rt);

    const payload: JwtUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };
    const accessToken = this.jwtService.sign(payload);

    return { rawToken, accessToken };
  }

  private async killSession(sessionId: string): Promise<void> {
    await Promise.all([
      this.sessionRepo.update(sessionId, { isActive: false }),
      this.refreshTokenRepo.update(
        {
          session: {
            id: sessionId,
          },
          isUsed: false,
        },
        {
          isUsed: true,
        },
      ),
    ]);
  }

  private getRefreshExpiry(): Date {
    const raw =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    return new Date(Date.now() + parseDuration(raw));
  }
}

function parseDuration(str: string): number {
  const match = /^(\d+)([smhd])$/.exec(str);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return parseInt(match[1], 10) * multipliers[match[2]];
}
