import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginacaoQueryDto } from '../../../common/dto/paginacao-query.dto.js';

export class ConsultarApuracaoQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  grupoId?: number;

  @ApiPropertyOptional({ example: 'ES 2026.2' })
  @IsOptional()
  @IsString()
  turma?: string;

  @ApiPropertyOptional({
    description: 'Busca por nome ou matrícula.',
    example: 'Lucas',
  })
  @IsOptional()
  @IsString()
  busca?: string;
}
