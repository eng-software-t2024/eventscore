import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PosicaoDesempateItemDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  grupoId: number;

  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  posicao: number;
}

export class RegistrarDesempateDto {
  @ApiProperty({
    description:
      'Posição final de todos os grupos de todos os empates pendentes, enviados juntos.',
    type: PosicaoDesempateItemDto,
    isArray: true,
    minItems: 2,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PosicaoDesempateItemDto)
  posicoes: PosicaoDesempateItemDto[];

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    example: 'Sorteio na frente das equipes',
  })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justificativa: string;
}

export class DesempateRegistradoDto {
  @ApiProperty({ type: PosicaoDesempateItemDto, isArray: true })
  posicoes: PosicaoDesempateItemDto[];

  @ApiProperty({ example: 'Sorteio na frente das equipes' })
  justificativa: string;

  @ApiProperty({
    description: 'Nome do usuário que registrou a decisão.',
    example: 'Administrador Arena',
  })
  responsavel: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-24T20:10:00Z' })
  dataHora: string;
}
