import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthUserRepository } from './modules/auth/auth-user.repository.js';
import { PrismaAuthUserRepository } from './modules/auth/prisma-auth-user.repository.js';
import { EventosModule } from './modules/eventos/eventos.module.js';
import { GruposModule } from './modules/grupos/grupos.module.js';
import { ParticipantesModule } from './modules/participantes/participantes.module.js';
import { RelatoriosModule } from './modules/relatorios/relatorios.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateAppEnv,
    }),
    PrismaModule,
    AuditoriaModule,
    AuthModule.register({
      provide: AuthUserRepository,
      useClass: PrismaAuthUserRepository,
    }),
    HealthModule,
    EventosModule,
    GruposModule,
    ParticipantesModule,
    RelatoriosModule,
  ],
})
export class AppModule {}
