import { Module } from '@nestjs/common';
import { ClassificacaoController } from './classificacao.controller.js';
import { ClassificacaoService } from './classificacao.service.js';

@Module({
  controllers: [ClassificacaoController],
  providers: [ClassificacaoService],
  exports: [ClassificacaoService],
})
export class ClassificacaoModule {}
