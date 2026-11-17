import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AtualizarDiaEventoDto } from './dto/atualizar-dia-evento.dto.js';
import { CriarDiaEventoDto } from './dto/criar-dia-evento.dto.js';
import { DiaEventoResponseDto } from './dto/dia-evento-response.dto.js';
import { DiasEventoService } from './dias-evento.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';

@ApiTags('Dias do evento')
@ApiBearerAuth()
@Controller('eventos/:eventoId/dias')
@UseGuards(JwtAuthGuard)
export class DiasEventoController {
  constructor(private readonly service: DiasEventoService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar dia de um evento' })
  @ApiResponse({ status: 201, type: DiaEventoResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Já existe um dia com este número neste evento.',
  })
  @ApiResponse({
    status: 422,
    description:
      'O número do dia excede a quantidade configurada para o evento.',
  })
  @ApiNotFoundResponse({ description: 'Evento não encontrado' })
  create(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Body() dto: CriarDiaEventoDto,
  ) {
    return this.service.create(eventoId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar dias de um evento em ordem cronológica' })
  @ApiResponse({ status: 200, type: DiaEventoResponseDto, isArray: true })
  findAll(@Param('eventoId', ParseIntPipe) eventoId: number) {
    return this.service.findAll(eventoId);
  }

  @Patch(':diaId')
  @ApiOperation({ summary: 'Atualizar dia de um evento' })
  @ApiResponse({ status: 200, type: DiaEventoResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Já existe um dia com este número neste evento.',
  })
  @ApiResponse({
    status: 422,
    description:
      'O número do dia excede a quantidade configurada para o evento.',
  })
  update(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('diaId', ParseIntPipe) diaId: number,
    @Body() dto: AtualizarDiaEventoDto,
  ) {
    return this.service.update(eventoId, diaId, dto);
  }

  @Delete(':diaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir dia de um evento' })
  @ApiNoContentResponse({ description: 'Dia excluído' })
  @ApiResponse({
    status: 409,
    description: 'O dia possui registros associados.',
  })
  @ApiResponse({
    status: 503,
    description:
      'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
  })
  remove(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('diaId', ParseIntPipe) diaId: number,
  ): Promise<void> {
    return this.service.remove(eventoId, diaId);
  }
}
