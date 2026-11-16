import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service.js';

/** Global para que os módulos de lançamento injetem o serviço sem importá-lo. */
@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
