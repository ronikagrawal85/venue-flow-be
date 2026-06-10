import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { RegisterDto } from '../auth/dto/register.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthProvider, User } from './entities/user.entity';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  isEmailVerified: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(registerDto: RegisterDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    const newUser = this.userRepository.create({
      email: registerDto.email,
      passwordHash,
      authProvider: AuthProvider.LOCAL,
      name: registerDto.name ?? null,
    });

    return await this.userRepository.save(newUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    return await this.userRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'passwordHash',
        'role',
        'isEmailVerified',
        'authProvider',
      ],
    });
  }

  async findOrCreateByGoogle(profile: GoogleProfile): Promise<User> {
    // 1. Fast path — already linked Google account
    if (profile.googleId) {
      const byGoogleId = await this.userRepository.findOne({
        where: { googleId: profile.googleId },
      });
      if (byGoogleId) return byGoogleId;
    }

    // 2. Email match → link Google to existing account
    const byEmail = await this.userRepository.findOne({
      where: { email: profile.email },
    });
    if (byEmail) {
      byEmail.googleId = profile.googleId;
      if (!byEmail.name && profile.name) byEmail.name = profile.name;
      if (!byEmail.isEmailVerified && profile.isEmailVerified) {
        byEmail.isEmailVerified = true;
      }
      return await this.userRepository.save(byEmail);
    }

    // 3. Brand-new user via Google
    const newUser = this.userRepository.create({
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      authProvider: AuthProvider.GOOGLE,
      isEmailVerified: profile.isEmailVerified,
      passwordHash: null,
    });
    return await this.userRepository.save(newUser);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }

  // ── Profile management ──────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;

    return await this.userRepository.save(user);
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { url } = await this.cloudinaryService.uploadImage(file);

    user.avatarUrl = url;
    return await this.userRepository.save(user);
  }
}
