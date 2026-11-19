import {
  Body,
  Controller,
  Get,
  Param,
  ParseArrayPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { ResultadoParamsDto } from './dto/resultado-params.dto.js';
import { ResultadoSalvoDto } from './dto/resultado-salvo.dto.js';
import { ResultadoDto } from './dto/resultado.dto.js';
import { SalvarResultadoDto } from './dto/salvar-resultado.dto.js';
import { ResultadosService } from './resultados.service.js';

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
  description: 'Identificador ou corpo de resultados inválidos.',
  schema: {
    oneOf: [
      { $ref: getSchemaPath(ErroValidacaoDto) },
      { $ref: getSchemaPath(ErroPadraoDto) },
    ],
  },
};

const parseResultadosArrayPipe = new ParseArrayPipe({
  items: SalvarResultadoDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: false,
  transformOptions: { enableImplicitConversion: false },
});

@ApiTags('Resultados e Lançamentos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('eventos/:eventoId/desafios/:desafioId/resultados')
export class ResultadosController {
  constructor(private readonly resultados: ResultadosService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar colocações dos grupos no desafio',
    operationId: 'listarResultadosDoDesafio',
  })
  @ApiParam(parametroEventoId)
  @ApiParam(parametroDesafioId)
  @ApiOkResponse({ type: ResultadoDto, isArray: true })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento ou desafio não encontrado neste evento.',
    type: ErroPadraoDto,
  })
  list(@Param() params: ResultadoParamsDto): Promise<ResultadoDto[]> {
    return this.resultados.list(params.eventoId, params.desafioId);
  }

  @Put()
  @ApiOperation({
    summary: 'Salvar todas as colocações do desafio (idempotente)',
    operationId: 'salvarResultadosDoDesafio',
  })
  @ApiParam(parametroEventoId)
  @ApiParam(parametroDesafioId)
  @ApiBody({ type: SalvarResultadoDto, isArray: true })
  @ApiOkResponse({ type: ResultadoSalvoDto, isArray: true })
  @ApiBadRequestResponse(respostaRequisicaoInvalida)
  @ApiNotFoundResponse({
    description: 'Evento, desafio ou grupo não encontrado neste evento.',
    type: ErroPadraoDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Conjunto incompleto, grupo repetido, ausência inconsistente, colocação repetida/com lacunas ou sem pontuação configurada.',
    type: ErroPadraoDto,
  })
  save(
    @CurrentUserId() userId: number,
    @Param() params: ResultadoParamsDto,
    @Body(parseResultadosArrayPipe) items: SalvarResultadoDto[],
  ): Promise<ResultadoSalvoDto[]> {
    return this.resultados.save(
      userId,
      params.eventoId,
      params.desafioId,
      items,
    );
  }
}
