import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClassificacaoModule } from './modules/classificacao/classificacao.module.js';
import { AuthUserRepository } from './modules/auth/auth-user.repository.js';
import { PrismaAuthUserRepository } from './modules/auth/prisma-auth-user.repository.js';
import { ConfiguracaoModule } from './modules/configuracao/configuracao.module.js';
import { EventosModule } from './modules/eventos/eventos.module.js';
import { DesafiosModule } from './modules/desafios/desafios.module.js';
import { GruposModule } from './modules/grupos/grupos.module.js';
import { ParticipantesModule } from './modules/participantes/participantes.module.js';
import { FrequenciaModule } from './modules/frequencia/frequencia.module.js';
import { RelatoriosModule } from './modules/relatorios/relatorios.module.js';
import { ResultadosModule } from './modules/resultados/resultados.module.js';
import { BonificacoesPenalidadesModule } from './modules/bonificacoes-penalidades/bonificacoes-penalidades.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { DiasEventoModule } from './modules/dias-evento/dias-evento.module.js';

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
    ConfiguracaoModule,
    DiasEventoModule,
    DesafiosModule,
    GruposModule,
    ParticipantesModule,
    FrequenciaModule,
    RelatoriosModule,
    ResultadosModule,
    BonificacoesPenalidadesModule,
    ClassificacaoModule,
  ],
})
export class AppModule {}
