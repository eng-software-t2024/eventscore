import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { EventoIdParamsDto } from '../eventos/dto/evento-id-params.dto.js';
import { ClassificacaoService } from './classificacao.service.js';
import { ClassificacaoEnvelopeDto } from './dto/classificacao.dto.js';
import {
  DesempateRegistradoDto,
  RegistrarDesempateDto,
} from './dto/desempate.dto.js';

const respostaRequisicaoInvalida = {
  description: 'Identificador ou corpo inválido.',
  schema: {
    oneOf: [
      { $ref: getSchemaPath(ErroValidacaoDto) },
      { $ref: getSchemaPath(ErroPadraoDto) },
    ],
  },
};

const respostaEventoNaoEncontrado = {
  description: 'Evento não encontrado.',
  type: ErroPadraoDto,
};

const respostaEventoOuGrupoNaoEncontrado = {
  description:
    'Evento não encontrado, ou grupo enviado que não é deste evento.',
  type: ErroPadraoDto,
};

@ApiTags('Classificação e Apuração')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('eventos/:eventoId')
export class ClassificacaoController {
  constructor(private readonly classificacao: ClassificacaoService) {}

  @Get('classificacao')
  @ApiOperation({
    summary: 'Consultar classificação geral dos grupos (RF12, RF13)',
    description:
      'Calcula na hora, a partir dos lançamentos atuais, aplicando os critérios de desempate em ordem e as decisões manuais vigentes.',
    operationId: 'consultarClassificacaoGrupos',
  })
  @ApiOkResponse({ type: ClassificacaoEnvelopeDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse(respostaEventoNaoEncontrado)
  async consultar(
    @Param() params: EventoIdParamsDto,
  ): Promise<ClassificacaoEnvelopeDto> {
    const { dados, resumo } = await this.classificacao.consultar(
      params.eventoId,
    );
    return { dados, resumo };
  }

  @Post('desempates')
  @ApiOperation({
    summary: 'Registrar decisão manual de desempate (RF14)',
    description:
      'Resolve todos os empates pendentes de uma vez. Grava uma apuração nova com a classificação decidida, o responsável e a data; um novo envio substitui a decisão anterior dos mesmos grupos.',
    operationId: 'registrarDesempateManual',
  })
  @ApiCreatedResponse({ type: DesempateRegistradoDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse(respostaEventoOuGrupoNaoEncontrado)
  @ApiUnprocessableEntityResponse({
    description:
      'Desafios ainda sem lançamento, não há empate, grupo repetido ou fora de um empate, empate incompleto, posições fora da faixa do empate ou empate pendente sem decisão.',
    type: ErroPadraoDto,
  })
  registrarDesempate(
    @Param() params: EventoIdParamsDto,
    @Body() dto: RegistrarDesempateDto,
    @CurrentUserId() usuarioId: number,
  ): Promise<DesempateRegistradoDto> {
    return this.classificacao.registrarDesempate(
      params.eventoId,
      dto,
      usuarioId,
    );
  }
}
