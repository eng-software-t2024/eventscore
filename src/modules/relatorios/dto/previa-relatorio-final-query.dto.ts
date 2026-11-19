import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PreviaRelatorioFinalQueryDto {
  @ApiPropertyOptional({
    description: 'Busca por nome, matrícula ou turma.',
  })
  @IsOptional()
  @IsString()
  busca?: string;
}
