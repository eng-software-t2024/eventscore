import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

/** Fator aplicado ao ponto extra conforme os dias presentes (Regimento, art. 17). */
export class FatorPresencaItemDto {
  @ApiProperty({
    description:
      'Quantidade de dias em que o participante esteve presente (0 até a quantidade de dias do evento).',
    type: 'integer',
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 2,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INT)
  diasPresentes: number;

  @ApiProperty({
    description:
      'Fração de 0 a 1 aplicada sobre o ponto extra do grupo, com até quatro casas decimais (a tela mostra em %).',
    type: 'number',
    minimum: 0,
    maximum: 1,
    example: 1.0,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  fator: number;
}
