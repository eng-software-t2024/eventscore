import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

export class PontoColocacaoDto {
  @ApiProperty({
    description: 'Posição ordinal (1..N) na tabela de pontuação do desafio.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  colocacao: number;

  @ApiProperty({
    description: 'Pontuação inteira não negativa atribuída à colocação.',
    type: 'integer',
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 100,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INT)
  pontos: number;
}
