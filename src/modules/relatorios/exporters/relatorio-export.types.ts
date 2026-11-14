import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';

export type AlinhamentoColunaRelatorio = 'left' | 'center' | 'right';

export type ValorCelulaRelatorio = string | number;

export interface ColunaRelatorio {
  chave: string;
  titulo: string;
  alinhamento?: AlinhamentoColunaRelatorio;
  larguraPeso?: number;
  larguraMinimaXlsx?: number;
}

export interface SecaoRelatorio {
  titulo?: string;
  colunas: ColunaRelatorio[];
  linhas: Array<Record<string, ValorCelulaRelatorio>>;
  mensagemVazia?: string;
}

export interface TabelaRelatorioConfig {
  nomePlanilha?: string;
  nomeEvento: string;
  tituloRelatorio: string;
  subtitulo?: string;
  geradoEm?: Date;
  secoes: SecaoRelatorio[];
}

export interface ArquivoRelatorioGerado {
  buffer: Buffer;
  contentType: string;
  nomeArquivo: string;
  contentDisposition: string;
}

export const CONTENT_TYPE_POR_FORMATO: Record<FormatoRelatorio, string> = {
  [FormatoRelatorio.PDF]: 'application/pdf',
  [FormatoRelatorio.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function obterContentTypeRelatorio(formato: FormatoRelatorio): string {
  return CONTENT_TYPE_POR_FORMATO[formato];
}

export function slugificarNomeEvento(nome: string): string {
  const normalizado = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizado.length > 0 ? normalizado : 'evento';
}

export function montarNomeArquivoRelatorio(
  tipo: 'parcial' | 'final',
  nomeEvento: string,
  formato: FormatoRelatorio,
): string {
  const slug = slugificarNomeEvento(nomeEvento);
  const extensao = formato === FormatoRelatorio.PDF ? 'pdf' : 'xlsx';
  return `relatorio-${tipo}-${slug}.${extensao}`;
}

export function montarContentDisposition(nomeArquivo: string): string {
  const sanitizado = nomeArquivo.replace(/["\\\r\n]/g, '');
  return `attachment; filename="${sanitizado}"; filename*=UTF-8''${encodeURIComponent(sanitizado)}`;
}

export function formatarDataHoraGeracao(data: Date = new Date()): string {
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const ano = data.getUTCFullYear();
  const horas = String(data.getUTCHours()).padStart(2, '0');
  const minutos = String(data.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

