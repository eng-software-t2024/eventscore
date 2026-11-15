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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { EventoIdParamsDto } from '../eventos/dto/evento-id-params.dto.js';
import { FormatoRelatorioQueryDto } from './dto/formato-relatorio-query.dto.js';
import { RelatorioParcialService } from './parcial/relatorio-parcial.service.js';
import { PreviaRelatorioFinalQueryDto } from './dto/previa-relatorio-final-query.dto.js';
import { RelatorioFinalService } from './final/relatorio-final.service.js';

@ApiTags('Relatórios')
@ApiBearerAuth()
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
    type: ErroValidacaoDto,
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
  @ApiOkResponse({ description: 'Prévia agrupada por turma em array puro.' })
  @ApiBadRequestResponse({ type: ErroValidacaoDto })
  @ApiUnauthorizedResponse({ type: ErroPadraoDto })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  @ApiConflictResponse({
    description: 'Existe empate pendente na classificação.',
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
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ description: 'Arquivo binário do relatório final.' })
  @ApiBadRequestResponse({ type: ErroValidacaoDto })
  @ApiUnauthorizedResponse({ type: ErroPadraoDto })
  @ApiNotFoundResponse({ type: ErroPadraoDto })
  @ApiConflictResponse({
    description: 'Existe empate pendente na classificação.',
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
