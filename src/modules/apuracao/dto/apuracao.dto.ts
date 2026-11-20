import { ApiProperty } from '@nestjs/swagger';
import { PaginacaoMetaDto } from '../../../common/dto/paginacao-meta.dto.js';

export class LinhaApuracaoParticipanteDto {
  @ApiProperty({ type: 'integer', example: 1 })
  participanteId: number;

  @ApiProperty({ example: '2026-101' })
  matricula: string;

  @ApiProperty({ example: 'Lucas Vitorino' })
  nome: string;

  @ApiProperty({ example: 'ES 2026.2' })
  turma: string;

  @ApiProperty({ example: 'Alfa' })
  grupo: string;

  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  colocacaoGrupo: number;

  @ApiProperty({ type: 'number', example: 1 })
  pontoExtraGrupo: number;

  @ApiProperty({ type: 'integer', example: 2 })
  diasPresentes: number;

  @ApiProperty({ type: 'integer', example: 2 })
  diasTotais: number;

  @ApiProperty({ type: 'number', example: 1 })
  fator: number;

  @ApiProperty({ type: 'number', example: 1 })
  pontoExtra: number;
}

export class ResumoApuracaoDto {
  @ApiProperty({ type: 'integer', example: 72 })
  totalParticipantes: number;

  @ApiProperty({ type: 'number', example: 0.924 })
  assiduidade: number;

  @ApiProperty({ type: 'integer', example: 68 })
  aptos: number;
}

export class ApuracaoEnvelopeDto {
  @ApiProperty({ type: LinhaApuracaoParticipanteDto, isArray: true })
  dados: LinhaApuracaoParticipanteDto[];

  @ApiProperty({ type: PaginacaoMetaDto })
  paginacao: PaginacaoMetaDto;

  @ApiProperty({ type: ResumoApuracaoDto })
  resumo: ResumoApuracaoDto;
}
