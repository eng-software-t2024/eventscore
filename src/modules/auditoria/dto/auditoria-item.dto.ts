import { ApiProperty } from '@nestjs/swagger';
import { AUDIT_OPERATIONS } from '../auditoria.constants.js';

/** Uma alteração do histórico de um registro, no formato exibido pelo front. */
export class AuditoriaItemDto {
  @ApiProperty({
    description: 'Data e hora da alteração em ISO 8601 UTC.',
    format: 'date-time',
    example: '2026-11-23T14:38:00Z',
  })
  dataHora: string;

  @ApiProperty({
    description: 'Nome do administrador que fez a alteração.',
    example: 'Administrador Arena',
  })
  usuario: string;

  @ApiProperty({
    description: 'Tipo da alteração.',
    enum: AUDIT_OPERATIONS,
    example: 'UPDATE',
  })
  operacao: string;

  @ApiProperty({
    description:
      'Campos alterados antes da mudança, no formato `campo=valor` separado por `; `. Nulo quando não havia valor.',
    type: String,
    nullable: true,
    example: 'colocacao=2',
  })
  valorAnterior: string | null;

  @ApiProperty({
    description:
      'Campos alterados depois da mudança, no formato `campo=valor` separado por `; `. Nulo quando o valor foi removido.',
    type: String,
    nullable: true,
    example: 'colocacao=1',
  })
  valorNovo: string | null;
}
