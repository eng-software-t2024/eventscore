import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';

export class FormatoRelatorioQueryDto {
  @ApiProperty({
    enum: FormatoRelatorio,
    description: 'Formato de exportação do arquivo de relatório (PDF ou XLSX).',
    example: FormatoRelatorio.PDF,
  })
  @IsNotEmpty({ message: 'O formato do relatório é obrigatório' })
  @IsEnum(FormatoRelatorio, { message: 'O formato deve ser PDF ou XLSX' })
  formato!: FormatoRelatorio;
}
