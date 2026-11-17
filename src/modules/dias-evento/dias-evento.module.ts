import { Module } from '@nestjs/common';
import { DiasEventoController } from './dias-evento.controller.js';
import { DiasEventoService } from './dias-evento.service.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [DiasEventoController],
  providers: [DiasEventoService],
})
export class DiasEventoModule {}
