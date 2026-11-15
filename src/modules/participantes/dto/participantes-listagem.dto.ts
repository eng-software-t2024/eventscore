import { ApiProperty } from '@nestjs/swagger';
import { PaginacaoMetaDto } from '../../../common/dto/paginacao-meta.dto.js';
import { ParticipanteResumoDto } from './participante-resumo.dto.js';

export class ParticipantesListagemDto {
  @ApiProperty({ type: () => [ParticipanteResumoDto] })
  dados: ParticipanteResumoDto[];

  @ApiProperty({ type: () => PaginacaoMetaDto })
  paginacao: PaginacaoMetaDto;

  @ApiProperty({
    type: 'object',
    properties: {
      totalParticipantes: { type: 'integer', example: 12 },
    },
    required: ['totalParticipantes'],
    additionalProperties: false,
    example: { totalParticipantes: 12 },
  })
  resumo: { totalParticipantes: number };
}
