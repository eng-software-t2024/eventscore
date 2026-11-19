import { Module } from '@nestjs/common';
import { ConfiguracaoController } from './configuracao.controller.js';
import { ConfiguracaoService } from './configuracao.service.js';

@Module({
  controllers: [ConfiguracaoController],
  providers: [ConfiguracaoService],
  exports: [ConfiguracaoService],
})
export class ConfiguracaoModule {}
