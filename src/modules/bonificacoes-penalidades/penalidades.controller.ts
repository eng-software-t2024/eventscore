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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import {
  AtualizarPenalidadeDto,
  CriarPenalidadeDto,
  PenalidadeResumoDto,
} from './dto/penalidade.dto.js';
import { PenalidadesService } from './penalidades.service.js';

@ApiTags('Penalidades')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroPadraoDto })
@Controller('eventos/:eventoId/penalidades')
export class PenalidadesController {
  constructor(private readonly penalidades: PenalidadesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar penalidades do evento' })
  @ApiOkResponse({ type: PenalidadeResumoDto, isArray: true })
  list(@Param('eventoId', ParseIntPipe) eventId: number) {
    return this.penalidades.list(eventId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar penalidade para um grupo' })
  @ApiCreatedResponse({ type: PenalidadeResumoDto })
  @ApiUnprocessableEntityResponse({ type: ErroPadraoDto })
  create(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Body() dto: CriarPenalidadeDto,
  ) {
    return this.penalidades.create(eventId, dto);
  }

  @Patch(':penalidadeId')
  @ApiOperation({ summary: 'Atualizar penalidade' })
  @ApiOkResponse({ type: PenalidadeResumoDto })
  @ApiUnprocessableEntityResponse({ type: ErroPadraoDto })
  update(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Param('penalidadeId', ParseIntPipe) penaltyId: number,
    @Body() dto: AtualizarPenalidadeDto,
  ) {
    return this.penalidades.update(eventId, penaltyId, dto);
  }

  @Delete(':penalidadeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir penalidade' })
  @ApiNoContentResponse()
  remove(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Param('penalidadeId', ParseIntPipe) penaltyId: number,
  ) {
    return this.penalidades.remove(eventId, penaltyId);
  }
}
