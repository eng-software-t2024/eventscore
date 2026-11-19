import { Module } from '@nestjs/common';
import { DesafiosController } from './desafios.controller.js';
import { DesafiosService } from './desafios.service.js';

@Module({
  controllers: [DesafiosController],
  providers: [DesafiosService],
  exports: [DesafiosService],
})
export class DesafiosModule {}
