import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PontoColocacaoDto } from './ponto-colocacao.dto.js';

const MAX_POSTGRES_INT = 2_147_483_647;
const NOME_NAO_BRANCO_PATTERN = /\S/;

export class CriarDesafioDto {
  @ApiProperty({
    description:
      'Nome identificador do desafio. Espaços externos são removidos com trim() antes de validar o intervalo de 1 a 100 caracteres.',
    example: 'Hackathon',
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOME_NAO_BRANCO_PATTERN, {
    message: 'nome deve conter pelo menos um caractere não branco',
  })
  nome: string;

  @ApiPropertyOptional({
    description: 'Descrição opcional do desafio (máximo de 255 caracteres).',
    example: 'Desenvolvimento em equipe',
    maxLength: 255,
    default: '',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @ApiProperty({
    description:
      'Identificador do dia de competição ao qual o desafio pertence.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 2,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  diaId: number;

  @ApiProperty({
    description:
      'Uma linha por grupo; colocações devem formar 1..N sem repetição.',
    type: [PontoColocacaoDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => PontoColocacaoDto)
  pontosColocacao: PontoColocacaoDto[];
}
