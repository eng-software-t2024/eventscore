import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TipoCriterioDesempate } from '../../../common/enums/tipo-criterio-desempate.enum.js';

const MAX_POSTGRES_INT = 2_147_483_647;

/** Critério de desempate aplicado em ordem na classificação (RF13). */
export class CriterioDesempateConfigDto {
  @ApiProperty({
    description: 'Ordem de aplicação do critério (1..N, sem lacunas).',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  ordem: number;

  @ApiProperty({
    description: 'Tipo do critério (V12).',
    enum: TipoCriterioDesempate,
    enumName: 'TipoCriterioDesempate',
    example: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
  })
  @IsEnum(TipoCriterioDesempate)
  tipo: TipoCriterioDesempate;

  @ApiProperty({
    description:
      'Desafio do evento. Obrigatório quando tipo = MAIOR_PONTUACAO_DESAFIO; null nos demais tipos.',
    type: 'integer',
    nullable: true,
    required: false,
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 3,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  desafioId?: number | null;

  @ApiProperty({
    description:
      'Descrição legível do critério. Espaços externos são removidos antes de validar.',
    minLength: 1,
    maxLength: 255,
    pattern: '\\S',
    example: 'Maior pontuação na Maratona de Programação',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, {
    message: 'descricao deve conter pelo menos um caractere não branco',
  })
  descricao: string;
}
