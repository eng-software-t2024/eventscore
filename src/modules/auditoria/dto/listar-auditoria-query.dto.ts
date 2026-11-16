import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  AUDITED_ENTITIES,
  type AuditedEntity,
} from '../auditoria.constants.js';

/** Identifica o registro cujo histórico será consultado. */
export class ListarAuditoriaQueryDto {
  @ApiProperty({
    description: 'Tipo do registro auditado.',
    enum: AUDITED_ENTITIES,
    example: 'RESULTADO_DESAFIO',
  })
  @IsIn(AUDITED_ENTITIES)
  entidade: AuditedEntity;

  @ApiProperty({
    description: 'Identificador do registro auditado.',
    type: 'integer',
    minimum: 1,
    maximum: 2_147_483_647,
    example: 15,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  registroId: number;
}
