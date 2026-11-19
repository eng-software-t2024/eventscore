import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const MAX_POSTGRES_INT = 2_147_483_647;

/** Item de bonificação do evento com o seu teto (RF02, RF10). */
export class ItemBonificacaoConfigDto {
  @ApiPropertyOptional({
    description:
      'Identificador do item. Ausente em item novo; presente para manter um item já cadastrado.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_POSTGRES_INT,
    example: 1,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  id?: number;

  @ApiProperty({
    description:
      'Nome do item de bonificação. Espaços externos são removidos antes de validar.',
    minLength: 1,
    maxLength: 150,
    pattern: '\\S',
    example: 'Uniformização',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/\S/, {
    message: 'nome deve conter pelo menos um caractere não branco',
  })
  nome: string;

  @ApiProperty({
    description: 'Pontuação máxima que um grupo pode receber neste item.',
    type: 'integer',
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 10,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INT)
  teto: number;
}
