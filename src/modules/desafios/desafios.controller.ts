import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { AtualizarDesafioDto } from './dto/atualizar-desafio.dto.js';
import { CriarDesafioDto } from './dto/criar-desafio.dto.js';
import {
  DesafioEventoIdParamsDto,
  DesafioParamsDto,
} from './dto/desafio-params.dto.js';
import { DesafioDto } from './dto/desafio.dto.js';
import { DesafiosService } from './desafios.service.js';

const parametroEventoId = {
  name: 'eventoId',
  description: 'Identificador numérico único do evento.',
  schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  example: 1,
};

const parametroDesafioId = {
  name: 'desafioId',
  description: 'Identificador numérico único do desafio.',
  schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  example: 3,
};

const respostaRequisicaoInvalida = {
  description: 'Identificador ou dados do desafio inválidos.',
  schema: {
    oneOf: [
      { $ref: getSchemaPath(ErroValidacaoDto) },
      { $ref: getSchemaPath(ErroPadraoDto) },
    ],
  },
};

@ApiTags('Desafios')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('eventos/:eventoId/desafios')
export class DesafiosController {
  constructor(private readonly desafios: DesafiosService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar desafios do evento',
    operationId: 'listarDesafios',
  })
  @ApiParam(parametroEventoId)
  @ApiOkResponse({ type: DesafioDto, isArray: true })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento não encontrado.',
    type: ErroPadraoDto,
  })
  list(@Param() params: DesafioEventoIdParamsDto): Promise<DesafioDto[]> {
    return this.desafios.list(params.eventoId);
  }

  @Post()
  @ApiOperation({
    summary: 'Criar desafio e tabela de pontos',
    operationId: 'criarDesafio',
  })
  @ApiParam(parametroEventoId)
  @ApiCreatedResponse({ type: DesafioDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento ou dia do evento não encontrado.',
    type: ErroPadraoDto,
  })
  @ApiConflictResponse({
    description: 'Já existe um desafio com o mesmo nome neste dia e evento.',
    type: ErroPadraoDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Evento sem grupos, tabela com número de linhas diferente de N ou colocações repetidas/com lacunas.',
    type: ErroPadraoDto,
  })
  create(
    @Param() params: DesafioEventoIdParamsDto,
    @Body() dto: CriarDesafioDto,
  ): Promise<DesafioDto> {
    return this.desafios.create(params.eventoId, dto);
  }

  @Get(':desafioId')
  @ApiOperation({
    summary: 'Consultar desafio no contexto do evento',
    operationId: 'obterDesafioPorId',
  })
  @ApiParam(parametroEventoId)
  @ApiParam(parametroDesafioId)
  @ApiOkResponse({ type: DesafioDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento ou desafio não encontrado neste evento.',
    type: ErroPadraoDto,
  })
  findById(@Param() params: DesafioParamsDto): Promise<DesafioDto> {
    return this.desafios.findById(params.eventoId, params.desafioId);
  }

  @Patch(':desafioId')
  @ApiOperation({
    summary: 'Atualizar desafio parcialmente',
    operationId: 'atualizarDesafio',
  })
  @ApiParam(parametroEventoId)
  @ApiParam(parametroDesafioId)
  @ApiOkResponse({ type: DesafioDto })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento, dia ou desafio não encontrado neste evento.',
    type: ErroPadraoDto,
  })
  @ApiConflictResponse({
    description:
      'Nome duplicado no mesmo dia e evento ou mudança efetiva de dia/tabela após resultados lançados.',
    type: ErroPadraoDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Tabela resultante incompatível com os grupos atuais do evento.',
    type: ErroPadraoDto,
  })
  update(
    @Param() params: DesafioParamsDto,
    @Body() dto: AtualizarDesafioDto,
  ): Promise<DesafioDto> {
    return this.desafios.update(params.eventoId, params.desafioId, dto);
  }

  @Delete(':desafioId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir desafio sem dependências impeditivas',
    operationId: 'excluirDesafio',
  })
  @ApiParam(parametroEventoId)
  @ApiParam(parametroDesafioId)
  @ApiNoContentResponse({
    description: 'Desafio excluído, sem corpo de resposta.',
  })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento ou desafio não encontrado neste evento.',
    type: ErroPadraoDto,
  })
  @ApiConflictResponse({
    description:
      'Desafio vinculado a critério de desempate ou com resultados lançados.',
    type: ErroPadraoDto,
  })
  remove(@Param() params: DesafioParamsDto): Promise<void> {
    return this.desafios.remove(params.eventoId, params.desafioId);
  }
}
