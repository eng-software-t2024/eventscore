import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtAuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { EventoFrontendDto } from '../management/management.dto.js';
import { ManagementService } from '../management/management.service.js';

@ApiTags('Telemetria')
@ApiBearerAuth()
@Controller('telemetry/client')
export class ClientTelemetryController {
  constructor(private readonly management: ManagementService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar evento sem conteúdo de formulário' })
  async register(
    @Body() body: EventoFrontendDto,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    await this.management.registrarEventoFrontend(
      req.user!.id,
      body,
      req.auth!.sessionId,
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        correlationId: req.get('x-correlation-id'),
      },
    );
  }
}
