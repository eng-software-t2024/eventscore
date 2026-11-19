import { Module } from '@nestjs/common';
import { ClassificacaoModule } from '../classificacao/classificacao.module.js';
import { EventosModule } from '../eventos/eventos.module.js';
import { PdfTabelaExporter } from './exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from './exporters/xlsx-planilha.exporter.js';
import { RelatorioParcialService } from './parcial/relatorio-parcial.service.js';
import { RelatorioFinalService } from './final/relatorio-final.service.js';
import { RelatoriosController } from './relatorios.controller.js';

@Module({
  imports: [EventosModule, ClassificacaoModule],
  controllers: [RelatoriosController],
  providers: [
    PdfTabelaExporter,
    XlsxPlanilhaExporter,
    RelatorioParcialService,
    RelatorioFinalService,
  ],
  exports: [
    PdfTabelaExporter,
    XlsxPlanilhaExporter,
    RelatorioParcialService,
    RelatorioFinalService,
  ],
})
export class RelatoriosModule {}
