import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class RegistrarPresencaDto {
  @ApiProperty({ description: 'Indica se o participante esteve presente.' })
  @IsBoolean()
  presente: boolean;
}
