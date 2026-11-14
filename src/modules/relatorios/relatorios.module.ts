import { Module } from '@nestjs/common';
import { EventosModule } from '../eventos/eventos.module.js';
import { PdfTabelaExporter } from './exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from './exporters/xlsx-planilha.exporter.js';
import { RelatorioParcialService } from './parcial/relatorio-parcial.service.js';
import { RelatoriosController } from './relatorios.controller.js';

@Module({
  imports: [EventosModule],
  controllers: [RelatoriosController],
  providers: [PdfTabelaExporter, XlsxPlanilhaExporter, RelatorioParcialService],
  exports: [PdfTabelaExporter, XlsxPlanilhaExporter, RelatorioParcialService],
})
export class RelatoriosModule {}
