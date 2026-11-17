import { ApiProperty } from '@nestjs/swagger';

const MAX_POSTGRES_INT = 2_147_483_647;

export class ResultadoDto {
  @ApiProperty({
    description:
      'Identificador persistido do resultado; null somente enquanto o lançamento ainda estiver pendente.',
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 11,
  })
  id: number | null;

  @ApiProperty({
    description: 'Identificador numérico do grupo.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  grupoId: number;

  @ApiProperty({
    description: 'Colocação obtida pelo grupo, ou null se ausente/pendente.',
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  colocacao: number | null;

  @ApiProperty({
    description: 'Indica se o grupo foi marcado como ausente.',
    example: false,
  })
  ausente: boolean;

  @ApiProperty({
    description:
      'Pontos da colocação no desafio; zero para ausência ou pendência.',
    type: 'integer',
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 100,
  })
  pontos: number;
}
