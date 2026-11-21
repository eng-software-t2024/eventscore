import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { FrequenciaService } from './frequencia.service.js';
import { ListarPresencasQueryDto } from './dto/listar-presencas-query.dto.js';
import { PresencaGradeDto } from './dto/presenca-grade.dto.js';
import { RegistrarPresencaDto } from './dto/registrar-presenca.dto.js';

@ApiTags('Frequência')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@ApiParam({ name: 'eventoId', type: 'integer', example: 1 })
@ApiParam({ name: 'diaId', type: 'integer', example: 1 })
@Controller('eventos/:eventoId/dias/:diaId/presencas')
export class FrequenciaController {
  constructor(private readonly frequencia: FrequenciaService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar presença dos participantes no dia' })
  @ApiQuery({ name: 'grupoId', required: false, type: 'integer' })
  @ApiQuery({ name: 'busca', required: false, type: String })
  @ApiOkResponse({ type: PresencaGradeDto })
  @ApiBadRequestResponse({
    description: 'Identificador ou filtro da consulta inválidos.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  listar(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('diaId', ParseIntPipe) diaId: number,
    @Query() query: ListarPresencasQueryDto,
  ) {
    return this.frequencia.listar(eventoId, diaId, query);
  }

  @Put(':participanteId')
  @ApiOperation({
    summary: 'Registrar ou atualizar presença de um participante no dia',
  })
  @ApiOkResponse({ schema: { example: { participanteId: 3, presente: true } } })
  @ApiBadRequestResponse({
    description: 'Identificador ou corpo da presença inválidos.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  registrar(
    @Param('eventoId', ParseIntPipe) eventoId: number,
    @Param('diaId', ParseIntPipe) diaId: number,
    @Param('participanteId', ParseIntPipe) participanteId: number,
    @Body() dto: RegistrarPresencaDto,
  ) {
    return this.frequencia.registrar(eventoId, diaId, participanteId, dto);
  }
}
