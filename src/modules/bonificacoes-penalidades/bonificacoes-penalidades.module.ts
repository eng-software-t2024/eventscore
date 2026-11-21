import { Module } from '@nestjs/common';
import { BonificacoesController } from './bonificacoes.controller.js';
import { BonificacoesService } from './bonificacoes.service.js';
import { PenalidadesController } from './penalidades.controller.js';
import { PenalidadesService } from './penalidades.service.js';

@Module({
  controllers: [BonificacoesController, PenalidadesController],
  providers: [BonificacoesService, PenalidadesService],
  exports: [BonificacoesService, PenalidadesService],
})
export class BonificacoesPenalidadesModule {}
