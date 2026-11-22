import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { JwtAuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import {
  AtualizarUsuarioDto,
  CriarUsuarioDto,
  FiltroTelemetriaDto,
  ListarUsuariosDto,
  RedefinirSenhaDto,
  RevogarSessaoDto,
} from './management.dto.js';
import { ManagementService } from './management.service.js';
import { MasterOnlyGuard } from './master-only.guard.js';

@ApiTags('Gestão MASTER')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Acesso exclusivo ao perfil MASTER.' })
@UseGuards(MasterOnlyGuard)
@Controller('management')
export class ManagementController {
  constructor(private readonly management: ManagementService) {}

  @Get('users')
  @ApiOperation({ summary: 'Listar e filtrar usuários' })
  users(@Query() query: ListarUsuariosDto) {
    return this.management.listarUsuarios(query);
  }

  @Post('users')
  @ApiOperation({ summary: 'Criar usuário ADMIN' })
  createUser(
    @Body() body: CriarUsuarioDto,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    return this.management.criarUsuario(body, req.user!.id, correlation(req));
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Editar ou ativar/desativar usuário' })
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AtualizarUsuarioDto,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    return this.management.atualizarUsuario(
      id,
      body,
      req.user!.id,
      correlation(req),
    );
  }

  @Post('users/:id/password')
  @ApiOperation({ summary: 'Redefinir senha e revogar sessões existentes' })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RedefinirSenhaDto,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    return this.management.redefinirSenha(
      id,
      body.senha,
      req.user!.id,
      correlation(req),
    );
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Excluir usuário sem referências' })
  deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    return this.management.excluirUsuario(id, req.user!.id, correlation(req));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Listar sessões e seu estado' })
  sessions(
    @Query('usuarioId') usuarioId?: string,
    @Query('limite') limite?: string,
  ) {
    const user = usuarioId ? Number(usuarioId) : undefined;
    const take = Math.min(100, Math.max(1, Number(limite) || 100));
    return this.management.listarSessoes(take, user);
  }

  @Post('sessions/:id/revoke')
  @ApiOperation({ summary: 'Revogar sessão ativa' })
  revoke(
    @Param('id') id: string,
    @Body() _body: RevogarSessaoDto,
    @Req() req: JwtAuthenticatedRequest,
  ) {
    return this.management.revogarSessao(id, req.user!.id, correlation(req));
  }

  @Get('telemetry/events')
  @ApiOperation({ summary: 'Consultar telemetria com filtros' })
  telemetry(@Query() query: FiltroTelemetriaDto) {
    return this.management.listarTelemetria(query);
  }

  @Get('telemetry/users/:id/timeline')
  @ApiOperation({ summary: 'Linha do tempo de um usuário' })
  timeline(
    @Param('id', ParseIntPipe) id: number,
    @Query('limite') limite?: string,
  ) {
    return this.management.linhaDoTempo(
      id,
      Math.min(200, Math.max(1, Number(limite) || 100)),
    );
  }

  @Get('telemetry/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTelemetry(
    @Query() query: FiltroTelemetriaDto,
    @Res() response: Response,
  ) {
    const rows = await this.management.listarTelemetria({
      limite: Math.min(query.limite ?? 50, 100),
      tipo: query.tipo,
      usuarioId: query.usuarioId,
      desde: query.desde,
      ate: query.ate,
    });
    const header = [
      'horario_utc',
      'usuario_id',
      'usuario',
      'origem',
      'evento',
      'metodo',
      'rota',
      'status',
      'duracao_ms',
      'resultado',
      'correlation_id',
      'ip',
      'user_agent',
    ];
    const lines = rows.map((e) =>
      [
        e.occurredAt.toISOString(),
        e.usuarioId ?? '',
        e.usuario?.nome ?? '',
        e.source,
        e.eventType,
        e.method ?? '',
        e.route ?? '',
        e.status ?? '',
        e.durationMs ?? '',
        e.outcome,
        e.correlationId ?? '',
        e.ip ?? '',
        e.userAgent ?? '',
      ]
        .map(csv)
        .join(','),
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="eventscore-telemetria.csv"',
    );
    response.send(`\uFEFF${header.join(',')}\r\n${lines.join('\r\n')}`);
  }

  @Get('telemetry/period')
  @ApiOperation({ summary: 'Consultar período atual e retenção' })
  period() {
    return this.management.periodo();
  }

  @Post('telemetry/period/close')
  @ApiOperation({ summary: 'Encerrar período e iniciar retenção de 30 dias' })
  closePeriod(@Req() req: JwtAuthenticatedRequest) {
    return this.management.encerrarPeriodo(req.user!.id, correlation(req));
  }

  @Get('audit')
  @ApiOperation({ summary: 'Consultar auditoria administrativa imutável' })
  audit(@Query('limite') limite?: string) {
    return this.management.listarAuditoria(
      Math.min(200, Math.max(1, Number(limite) || 100)),
    );
  }
}

function correlation(req: Request) {
  const value = req.get('x-correlation-id');
  return value && /^[\w.-]{1,100}$/.test(value) ? value : undefined;
}

function csv(value: string | number) {
  let text = String(value);
  if (/^[-=+@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
