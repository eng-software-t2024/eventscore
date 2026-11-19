import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { EventoIdParamsDto } from '../eventos/dto/evento-id-params.dto.js';
import { FormatoRelatorioQueryDto } from './dto/formato-relatorio-query.dto.js';
import { RelatorioParcialService } from './parcial/relatorio-parcial.service.js';
import { PreviaRelatorioFinalQueryDto } from './dto/previa-relatorio-final-query.dto.js';
import {
  ParticipanteRelatorioFinalDto,
  PresencaRelatorioFinalDto,
  TurmaRelatorioFinalDto,
} from './dto/relatorio-final-response.dto.js';
import { RelatorioFinalService } from './final/relatorio-final.service.js';

@ApiTags('Relatórios')
@ApiBearerAuth()
@ApiExtraModels(
  TurmaRelatorioFinalDto,
  ParticipanteRelatorioFinalDto,
  PresencaRelatorioFinalDto,
)
@Controller('eventos/:eventoId/relatorios')
export class RelatoriosController {
  constructor(
    private readonly relatorioParcialService: RelatorioParcialService,
    private readonly relatorioFinalService: RelatorioFinalService,
  ) {}

  @Get('parcial')
  @ApiOperation({
    summary:
      'Exporta o relatório parcial de classificação por grupo em PDF ou XLSX (RF15)',
  })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({
    description:
      'Arquivo binário do relatório parcial gerado em PDF ou XLSX com cabeçalho Content-Disposition.',
    headers: {
      'Content-Disposition': {
        description: 'Nome sugerido do arquivo para download.',
        schema: {
          type: 'string',
          example:
            'attachment; filename="relatorio-parcial-arena-comp-2026.pdf"; filename*=UTF-8\'\'relatorio-parcial-arena-comp-2026.pdf',
        },
      },
    },
    content: {
      'application/pdf': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Parâmetro de rota ou formato de exportação inválido.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT ausente ou inválido.',
    type: ErroPadraoDto,
  })
  @ApiNotFoundResponse({
    description: 'Evento não encontrado.',
    type: ErroPadraoDto,
  })
  async exportarParcial(
    @Param() params: EventoIdParamsDto,
    @Query() query: FormatoRelatorioQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const arquivo = await this.relatorioParcialService.gerarRelatorioParcial(
      params.eventoId,
      query.formato,
    );

    res.setHeader('Content-Type', arquivo.contentType);
    res.setHeader('Content-Disposition', arquivo.contentDisposition);

    return new StreamableFile(arquivo.buffer);
  }

  @Get('final/previa')
  @ApiOperation({
    summary: 'Consultar a prévia do relatório final por participante',
  })
  @ApiOkResponse({
    description:
      'Prévia em array puro ordenado por turma e nome, incluindo os dias e ausências.',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: { $ref: getSchemaPath(TurmaRelatorioFinalDto) },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErroPadraoDto })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  @ApiConflictResponse({
    type: ErroPadraoDto,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErroPadraoDto) },
      },
    },
    description:
      'Relatório final indisponível: evento sem grupos, sem desafios, com resultados pendentes ou empate pendente.',
  })
  previa(
    @Param() params: EventoIdParamsDto,
    @Query() query: PreviaRelatorioFinalQueryDto,
  ) {
    return this.relatorioFinalService.gerarPrevia(params.eventoId, query);
  }

  @Get('final')
  @ApiOperation({
    summary: 'Exportar o relatório final por participante em PDF ou XLSX',
  })
  @ApiOkResponse({
    description: 'Arquivo binário do relatório final.',
    headers: {
      'Content-Disposition': {
        description:
          'Instrução de download com o nome sugerido para o arquivo.',
        schema: { type: 'string' },
      },
    },
    content: {
      'application/pdf': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiBadRequestResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ErroValidacaoDto) },
        { $ref: getSchemaPath(ErroPadraoDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErroPadraoDto })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  @ApiConflictResponse({
    type: ErroPadraoDto,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErroPadraoDto) },
      },
    },
    description:
      'Relatório final indisponível: evento sem grupos, sem desafios, com resultados pendentes ou empate pendente.',
  })
  async exportarFinal(
    @Param() params: EventoIdParamsDto,
    @Query() query: FormatoRelatorioQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const arquivo = await this.relatorioFinalService.gerarRelatorioFinal(
      params.eventoId,
      query.formato,
    );
    res.setHeader('Content-Type', arquivo.contentType);
    res.setHeader('Content-Disposition', arquivo.contentDisposition);
    return new StreamableFile(arquivo.buffer);
  }
}
