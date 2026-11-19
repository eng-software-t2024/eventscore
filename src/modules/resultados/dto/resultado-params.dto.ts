import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

function parsePositiveIntParam(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class ResultadoParamsDto {
  @ApiProperty({
    description: 'Identificador numérico único do evento.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @Transform(({ value }: { value: unknown }) => parsePositiveIntParam(value))
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  eventoId: number;

  @ApiProperty({
    description: 'Identificador numérico único do desafio.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 3,
  })
  @Transform(({ value }: { value: unknown }) => parsePositiveIntParam(value))
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  desafioId: number;
}
