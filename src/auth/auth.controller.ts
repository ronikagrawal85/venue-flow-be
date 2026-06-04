import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from './interfaces/request-with-user.interface';

const REFRESH_COOKIE = 'refreshToken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login — returns access token; sets HttpOnly refresh-token cookie',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns { access_token, user }. Refresh token is in the Set-Cookie header.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const {
      accessToken,
      rawRefreshToken,
      user: jwtUser,
    } = await this.authService.login(user, req);

    res.cookie(REFRESH_COOKIE, rawRefreshToken, COOKIE_OPTIONS);
    return { access_token: accessToken, user: jwtUser };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary:
      'Rotate refresh token — reads cookie, returns new access token + sets new refresh-token cookie',
  })
  @ApiResponse({
    status: 200,
    description: 'New access_token returned; new refreshToken cookie set.',
  })
  @ApiResponse({ status: 401, description: 'Missing or expired refresh token' })
  @ApiResponse({
    status: 403,
    description: 'Token reuse detected — session terminated',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

    const { accessToken, rawRefreshToken } = await this.authService.refresh(
      rawToken ?? '',
    );

    res.cookie(REFRESH_COOKIE, rawRefreshToken, COOKIE_OPTIONS);

    return { access_token: accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout current device — revokes this session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout all devices — revokes every active session',
  })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  async logoutAll(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(req.user.id);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'All sessions revoked' };
  }

  // ─── Active sessions ──────────────────────────────────────────────────────────

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Returns array of active Session records',
  })
  async getSessions(@Req() req: RequestWithUser) {
    return await this.authService.getActiveSessions(req.user.id);
  }
}
