import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CriarPenalidadeDto {
  @ApiProperty({ type: 'integer', example: 1 })
  @IsInt()
  @Min(1)
  grupoId: number;

  @ApiPropertyOptional({ example: 'Atraso na apresentação' })
  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @ApiProperty({ type: 'integer', minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  pontos: number;

  @ApiProperty({ example: 'A equipe iniciou a atividade após o horário.' })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  justificativa: string;
}

export class AtualizarPenalidadeDto extends PartialType(CriarPenalidadeDto) {}

export class PenalidadeResumoDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 'Atraso na apresentação' })
  descricao: string | null;

  @ApiProperty({ type: 'integer', example: 10 })
  pontos: number;

  @ApiProperty({ example: 'A equipe iniciou a atividade após o horário.' })
  justificativa: string;

  @ApiProperty({ type: 'integer', example: 1 })
  grupoId: number;
}
