import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

export class SalvarResultadoDto {
  @ApiProperty({
    description: 'Identificador numérico do grupo no evento.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  grupoId: number;

  @ApiProperty({
    description:
      'Posição inteira positiva (1..P) quando presente, ou null apenas quando ausente = true.',
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  colocacao: number | null;

  @ApiProperty({
    description: 'Indica se o grupo esteve ausente neste desafio.',
    example: false,
  })
  @IsBoolean()
  ausente: boolean;
}
