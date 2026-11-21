import { Module } from '@nestjs/common';
import { ClassificacaoModule } from '../classificacao/classificacao.module.js';
import { ApuracaoController } from './apuracao.controller.js';
import { ApuracaoService } from './apuracao.service.js';

@Module({
  imports: [ClassificacaoModule],
  controllers: [ApuracaoController],
  providers: [ApuracaoService],
})
export class ApuracaoModule {}
