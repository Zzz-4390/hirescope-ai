import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findPublicById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
  }

  create(email: string, passwordHash: string, displayName?: string) {
    return this.prisma.user.create({ data: { email, passwordHash, displayName } });
  }
}
