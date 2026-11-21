import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { EventoIdParamsDto } from '../eventos/dto/evento-id-params.dto.js';
import { ApuracaoService } from './apuracao.service.js';
import { ApuracaoEnvelopeDto } from './dto/apuracao.dto.js';
import { ConsultarApuracaoQueryDto } from './dto/consultar-apuracao-query.dto.js';

@ApiTags('Classificação e Apuração')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('eventos/:eventoId/apuracao')
export class ApuracaoController {
  constructor(private readonly service: ApuracaoService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar apuração individual de ponto extra (RF16)',
    description:
      'Calcula na consulta ROUND(pontoExtraGrupo * fator, 2) para cada participante. Exige resultados de todos os desafios para todos os grupos, configuração completa de conversões e fatores, e desempates resolvidos.',
    operationId: 'consultarApuracaoIndividual',
  })
  @ApiOkResponse({ type: ApuracaoEnvelopeDto })
  @ApiBadRequestResponse({
    description: 'Identificador ou filtros inválidos.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiNotFoundResponse({
    description: 'Evento não encontrado.',
    type: ErroPadraoDto,
  })
  @ApiConflictResponse({
    description: 'Resultados ou configuração incompletos, ou empate pendente.',
    type: ErroPadraoDto,
  })
  getResults(
    @Param() params: EventoIdParamsDto,
    @Query() query: ConsultarApuracaoQueryDto,
  ): Promise<ApuracaoEnvelopeDto> {
    return this.service.getResults(params.eventoId, query);
  }
}
