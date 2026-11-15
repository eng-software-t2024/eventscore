import { Module } from '@nestjs/common';
import { FrequenciaController } from './frequencia.controller.js';
import { FrequenciaService } from './frequencia.service.js';

@Module({
  controllers: [FrequenciaController],
  providers: [FrequenciaService],
  exports: [FrequenciaService],
})
export class FrequenciaModule {}
