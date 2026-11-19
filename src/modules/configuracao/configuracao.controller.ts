import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { EventoIdParamsDto } from '../eventos/dto/evento-id-params.dto.js';
import { ConfiguracaoService } from './configuracao.service.js';
import { ConfiguracaoEventoDto } from './dto/configuracao-evento.dto.js';

const parametroEventoId = {
  name: 'eventoId',
  description: 'Identificador numérico único do evento.',
  schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  example: 1,
};

const respostaRequisicaoInvalida = {
  description: 'Identificador do evento ou corpo da configuração inválidos.',
  schema: {
    oneOf: [
      { $ref: getSchemaPath(ErroValidacaoDto) },
      { $ref: getSchemaPath(ErroPadraoDto) },
    ],
  },
};

@ApiTags('Configuração')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('eventos/:eventoId/configuracao')
export class ConfiguracaoController {
  constructor(private readonly configuracao: ConfiguracaoService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar configuração de pontuação do evento (RF02)',
    operationId: 'obterConfiguracaoEvento',
  })
  @ApiParam(parametroEventoId)
  @ApiOkResponse({ type: ConfiguracaoEventoDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento não encontrado.',
    type: ErroPadraoDto,
  })
  obter(@Param() params: EventoIdParamsDto): Promise<ConfiguracaoEventoDto> {
    return this.configuracao.obter(params.eventoId);
  }

  @Put()
  @ApiOperation({
    summary: 'Salvar configuração completa do evento (idempotente)',
    operationId: 'salvarConfiguracaoEvento',
  })
  @ApiParam(parametroEventoId)
  @ApiOkResponse({ type: ConfiguracaoEventoDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description:
      'Evento não encontrado, ou item de bonificação ou desafio de outro evento.',
    type: ErroPadraoDto,
  })
  @ApiConflictResponse({
    description:
      'Remoção de item de bonificação já lançado ou de critério usado em apuração.',
    type: ErroPadraoDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Regra de negócio violada: tabelas incompletas, faixa inválida, critério repetido ou alteração que invalida lançamento existente.',
    type: ErroPadraoDto,
  })
  salvar(
    @Param() params: EventoIdParamsDto,
    @Body() dto: ConfiguracaoEventoDto,
  ): Promise<ConfiguracaoEventoDto> {
    return this.configuracao.salvar(params.eventoId, dto);
  }
}
