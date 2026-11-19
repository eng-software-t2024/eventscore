import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min, ValidateIf } from 'class-validator';

export class AtualizarDiaEventoDto {
  @ApiPropertyOptional({ minimum: 1, example: 1 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  numeroDia?: number;

  @ApiPropertyOptional({ format: 'date', example: '2026-11-21' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'data deve estar no formato YYYY-MM-DD',
  })
  data?: string;
}
