import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

/** Ponto extra de uma colocação final do grupo (Regimento, art. 17). */
export class ConversaoPontoExtraItemDto {
  @ApiProperty({
    description: 'Colocação final do grupo na classificação geral.',
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
    description:
      'Ponto extra atribuído à colocação, de 0 a 1 com uma casa decimal (coluna NUMERIC(5,1)).',
    type: 'number',
    minimum: 0,
    maximum: 1,
    example: 1.0,
  })
  // Uma casa decimal: o banco arredondaria 0.85 para 0.9 sem avisar.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1)
  pontoExtra: number;
}
