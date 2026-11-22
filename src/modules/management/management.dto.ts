import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListarUsuariosDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
  @ApiPropertyOptional({ enum: ['ADMIN', 'MASTER'] })
  @IsOptional()
  @IsIn(['ADMIN', 'MASTER'])
  perfil?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  ativo?: boolean;
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pagina = 1;
  @ApiPropertyOptional({ type: Number, default: 25, maximum: 100, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 25;
}

export class CriarUsuarioDto {
  @ApiProperty({ maxLength: 150 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nome!: string;
  @ApiProperty({ format: 'email', maxLength: 150 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email!: string;
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  senha!: string;
}

export class AtualizarUsuarioDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nome?: string;
  @ApiPropertyOptional({ format: 'email', maxLength: 150 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class RedefinirSenhaDto {
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  senha!: string;
}

export class EventoFrontendDto {
  @ApiProperty({
    enum: [
      'ROUTE_CHANGE',
      'ACTION',
      'MODAL_OPEN',
      'MODAL_CLOSE',
      'FORM_SUBMIT',
      'JS_ERROR',
      'API_FAILURE',
      'TAB_VISIBILITY',
      'IDLE',
    ],
  })
  @IsIn([
    'ROUTE_CHANGE',
    'ACTION',
    'MODAL_OPEN',
    'MODAL_CLOSE',
    'FORM_SUBMIT',
    'JS_ERROR',
    'API_FAILURE',
    'TAB_VISIBILITY',
    'IDLE',
  ])
  eventType!: string;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rota?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  acao?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visivel?: boolean;
}

export class FiltroTelemetriaDto {
  @ApiPropertyOptional({ type: Number, default: 50, maximum: 100, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 50;
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipo?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  usuarioId?: number;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  desde?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  ate?: string;
}

export class RevogarSessaoDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  justificativa?: string;
}
