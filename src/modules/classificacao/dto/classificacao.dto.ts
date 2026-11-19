import { ApiProperty } from '@nestjs/swagger';

export class LinhaClassificacaoGrupoDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  posicao: number;

  @ApiProperty({ type: 'integer', example: 1 })
  grupoId: number;

  @ApiProperty({ example: 'Alfa' })
  grupo: string;

  @ApiProperty({ example: '#FF5733' })
  cor: string;

  @ApiProperty({ type: 'integer', example: 260 })
  pontosDesafios: number;

  @ApiProperty({ type: 'integer', example: 18 })
  bonificacao: number;

  @ApiProperty({ type: 'integer', example: 0 })
  penalidade: number;

  @ApiProperty({ type: 'integer', example: 278 })
  total: number;

  @ApiProperty({
    description:
      'Verdadeiro quando o grupo está num empate que os critérios e o desempate manual não resolveram.',
    example: false,
  })
  empatado: boolean;
}

export class ResumoClassificacaoDto {
  @ApiProperty({ type: 'integer', example: 4 })
  desafiosLancados: number;

  @ApiProperty({ type: 'integer', example: 4 })
  desafiosTotais: number;

  @ApiProperty({
    description:
      'Listas de grupoId empatados que não foram separados pelos critérios nem por decisão manual vigente.',
    type: 'array',
    items: { type: 'array', items: { type: 'integer' } },
    example: [
      [2, 3],
      [5, 6],
    ],
  })
  empatesPendentes: number[][];
}

export class ClassificacaoEnvelopeDto {
  @ApiProperty({ type: LinhaClassificacaoGrupoDto, isArray: true })
  dados: LinhaClassificacaoGrupoDto[];

  @ApiProperty({ type: ResumoClassificacaoDto })
  resumo: ResumoClassificacaoDto;
}
