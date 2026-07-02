import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { authConfiguration } from './config/configuration';

export function configureApplication(app: INestApplication): void {
  const config = authConfiguration();
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  });
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
}
