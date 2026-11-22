import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Optional,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtAuthenticatedRequest } from './jwt-auth.guard.js';
import { LoginService } from './login.service.js';
import type { LoginResponse } from './login.service.js';
import { Public } from './public.decorator.js';
import { SecurityTelemetryService } from '../security-telemetry/security-telemetry.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly authService: AuthService,
    @Optional() private readonly telemetry?: SecurityTelemetryService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar administrador' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'senha'],
      properties: {
        email: { type: 'string', format: 'email' },
        senha: { type: 'string', format: 'password' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'JWT e dados públicos do administrador',
    schema: {
      type: 'object',
      required: ['token', 'expiraEm', 'usuario'],
      properties: {
        token: { type: 'string' },
        expiraEm: { type: 'string', format: 'date-time' },
        usuario: {
          type: 'object',
          required: ['id', 'nome', 'email', 'perfil'],
          properties: {
            id: { type: 'integer' },
            nome: { type: 'string' },
            email: { type: 'string', format: 'email' },
            perfil: { type: 'string', enum: ['ADMIN', 'MASTER'] },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dados de login inválidos' })
  @ApiResponse({ status: 401, description: 'E-mail ou senha inválidos' })
  login(
    @Body() credentials: LoginDto,
    @Req() request: JwtAuthenticatedRequest,
  ): Promise<LoginResponse> {
    return this.loginService.login(credentials, request);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logout(@Req() request: JwtAuthenticatedRequest): Promise<void> {
    if (!request.user)
      throw new UnauthorizedException('Token ausente ou inválido');
    if (!this.telemetry && process.env.NODE_ENV !== 'test') {
      throw new UnauthorizedException('Sessões persistidas indisponíveis');
    }
    await this.telemetry?.encerrarSessao(
      request.auth?.sessionId ?? '',
      'LOGOUT',
      request.user.id,
    );
    await this.telemetry?.registrarEvento({
      usuarioId: request.user.id,
      source: 'AUTH',
      eventType: 'LOGOUT',
      outcome: 'INFO',
      ip: request.ip,
      userAgent: request.get('user-agent'),
      route: '/auth/logout',
      method: 'POST',
      status: 204,
      correlationId: request.get('x-correlation-id'),
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter administrador autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Dados públicos do administrador',
    schema: {
      type: 'object',
      required: ['id', 'nome', 'email', 'perfil'],
      properties: {
        id: { type: 'integer' },
        nome: { type: 'string' },
        email: { type: 'string', format: 'email' },
        perfil: { type: 'string', enum: ['ADMIN', 'MASTER'] },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token ausente, inválido ou expirado',
  })
  me(@Req() request: JwtAuthenticatedRequest): Promise<AuthenticatedUser> {
    if (!request.user) {
      throw new UnauthorizedException('Token ausente ou inválido');
    }
    return this.authService.getCurrentUser(request.user.id);
  }
}
