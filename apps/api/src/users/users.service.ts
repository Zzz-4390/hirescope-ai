import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByIdentifier(identifier: string) {
    return identifier.includes('@')
      ? this.prisma.user.findUnique({ where: { email: identifier } })
      : this.prisma.user.findUnique({ where: { username: identifier } });
  }

  findPublicById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, displayName: true, avatarObjectKey: true, createdAt: true },
    });
  }

  findCredentialsById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    });
  }

  updateAvatarObjectKey(id: string, avatarObjectKey: string) {
    return this.prisma.user.update({
      where: { id },
      data: { avatarObjectKey },
      select: { id: true, username: true, email: true, displayName: true, avatarObjectKey: true, createdAt: true },
    });
  }

  updatePasswordIfCurrentHash(id: string, currentPasswordHash: string, passwordHash: string) {
    return this.prisma.user.updateMany({
      where: { id, passwordHash: currentPasswordHash },
      data: { passwordHash },
    });
  }

  create(username: string, email: string, passwordHash: string) {
    return this.prisma.user.create({ data: { username, email, passwordHash } });
  }
}
