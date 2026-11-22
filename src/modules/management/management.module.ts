import { Module } from '@nestjs/common';
import { ManagementController } from './management.controller.js';
import { ManagementService } from './management.service.js';
import { MasterOnlyGuard } from './master-only.guard.js';
import { ClientTelemetryController } from '../security-telemetry/client-telemetry.controller.js';

@Module({
  controllers: [ManagementController, ClientTelemetryController],
  providers: [ManagementService, MasterOnlyGuard],
  exports: [ManagementService],
})
export class ManagementModule {}
