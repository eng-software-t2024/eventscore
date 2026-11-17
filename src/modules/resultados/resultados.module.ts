import { Module } from '@nestjs/common';
import { ResultadosController } from './resultados.controller.js';
import { ResultadosService } from './resultados.service.js';

@Module({
  controllers: [ResultadosController],
  providers: [ResultadosService],
  exports: [ResultadosService],
})
export class ResultadosModule {}
