import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { ObjectStorageService } from '../object-storage/object-storage.service';
import { UsersService } from '../users/users.service';
import { MAX_AVATAR_BYTES } from './avatar-upload.interceptor';
import { PASSWORD_SERVICE, SESSION_SERVICE, TOKEN_SERVICE } from './auth.constants';
import type { PasswordService } from './services/password.service';
import type { SessionService } from './services/session.service';
import type { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
  ) {}

  async register(username: string, email: string, password: string): Promise<{ accepted: true }> {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    try {
      await this.users.create(normalizedUsername, normalizedEmail, passwordHash);
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') throw error;
    }
    return { accepted: true };
  }

  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await this.users.findByIdentifier(normalizedIdentifier);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyDummy(password);
    if (!user || !valid) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '用户名、邮箱或密码错误' });

    const publicUser = await this.serializeUser(user);
    try {
      const session = await this.sessions.create(user.id);
      const accessToken = await this.tokens.issueAccessToken(user.id, session.sessionId);
      return {
        accessToken,
        expiresIn: 900,
        cookieValue: session.cookieValue,
        user: publicUser,
      };
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用' });
    }
  }

  async refresh(cookieValue: string) {
    let session;
    try {
      session = await this.sessions.rotate(cookieValue);
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用' });
    }
    if (!session) throw new UnauthorizedException({ code: 'AUTH_INVALID_SESSION', message: '会话无效或已过期' });
    const accessToken = await this.tokens.issueAccessToken(session.userId, session.sessionId);
    return { accessToken, expiresIn: 900, cookieValue: session.cookieValue };
  }

  async logout(cookieValue: string | undefined): Promise<void> {
    if (!cookieValue) return;
    try {
      await this.sessions.logout(cookieValue);
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用' });
    }
  }

  async me(userId: string) {
    const user = await this.users.findPublicById(userId);
    if (!user) throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });
    return this.serializeUser(user);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const detected = this.validateAvatar(file);
    const user = await this.users.findPublicById(userId);
    if (!user) throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });

    const objectKey = `avatars/${userId}/${randomUUID()}${detected.extension}`;
    try {
      await this.objectStorage.upload({ objectKey, content: file.buffer, contentType: detected.contentType });
    } catch {
      throw new BadGatewayException({ code: 'AVATAR_UPLOAD_FAILED', message: '头像上传失败，请稍后重试' });
    }

    let updatedUser;
    try {
      updatedUser = await this.users.updateAvatarObjectKey(userId, objectKey);
    } catch (error) {
      await this.deleteObjectBestEffort(objectKey);
      throw error;
    }

    if (user.avatarObjectKey && user.avatarObjectKey !== objectKey) {
      await this.deleteObjectBestEffort(user.avatarObjectKey);
    }
    return this.serializeUser(updatedUser);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });

    if (!await this.passwords.verify(user.passwordHash, currentPassword)) {
      throw new BadRequestException({ code: 'CURRENT_PASSWORD_INVALID', message: '当前密码错误' });
    }
    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException({ code: 'PASSWORD_UNCHANGED', message: '新密码不能与当前密码相同' });
    }

    const passwordHash = await this.passwords.hash(newPassword);
    try {
      await this.sessions.revokeAll(userId);
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用，请稍后重试' });
    }

    const result = await this.users.updatePasswordIfCurrentHash(userId, user.passwordHash, passwordHash);
    if (result.count !== 1) {
      throw new ConflictException({ code: 'PASSWORD_CHANGE_CONFLICT', message: '密码已发生变化，请重新登录后再试' });
    }
  }

  private async serializeUser(user: {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    avatarObjectKey: string | null;
    createdAt?: Date;
  }) {
    let avatarUrl: string | null = null;
    if (user.avatarObjectKey) {
      try {
        avatarUrl = await this.objectStorage.createSignedReadUrl(user.avatarObjectKey);
      } catch {
        throw new ServiceUnavailableException({ code: 'AVATAR_URL_UNAVAILABLE', message: '头像服务暂时不可用，请稍后重试' });
      }
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      avatarUrl,
    };
  }

  private validateAvatar(file: Express.Multer.File): { extension: string; contentType: string } {
    if (Math.max(file.size, file.buffer.length) > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeException({ code: 'AVATAR_TOO_LARGE', message: '头像文件不能超过 5MB' });
    }

    const extension = extname(file.originalname).toLowerCase();
    const detected = detectImageType(file.buffer);
    const allowedExtensions = detected?.contentType === 'image/jpeg' ? new Set(['.jpg', '.jpeg']) : new Set([detected?.extension]);
    if (!detected || file.mimetype !== detected.contentType || !allowedExtensions.has(extension)) {
      throw new UnsupportedMediaTypeException({
        code: 'INVALID_AVATAR_FILE',
        message: '头像仅支持内容与扩展名一致的 JPEG、PNG 或 WebP 图片',
      });
    }
    return detected;
  }

  private async deleteObjectBestEffort(objectKey: string): Promise<void> {
    try {
      await this.objectStorage.delete(objectKey);
    } catch {
      // Cleanup is intentionally best effort; never log object keys or signed URLs.
    }
  }
}

function detectImageType(buffer: Buffer): { extension: string; contentType: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', contentType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', contentType: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: '.webp', contentType: 'image/webp' };
  }
  return null;
}
