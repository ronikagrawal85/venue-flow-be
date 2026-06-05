import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  /** Force account picker on every sign-in (prevents auto-login with cached account). */
  override authorizationParams(): Record<string, any> {
    return { prompt: 'select_account' };
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(
          new UnauthorizedException(
            'Google account has no email — cannot authenticate',
          ),
          false,
        );
      }

      const isEmailVerified = profile.emails?.[0]?.verified === true;

      const user: User = await this.usersService.findOrCreateByGoogle({
        googleId: profile.id,
        email,
        name: profile.displayName,
        isEmailVerified,
      });

      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
