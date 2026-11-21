import { ApiProperty } from '@nestjs/swagger';

export class PresencaRelatorioFinalDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  numeroDia!: number;

  @ApiProperty({ type: Boolean, example: false })
  presente!: boolean;
}

export class ParticipanteRelatorioFinalDto {
  @ApiProperty({ type: String, maxLength: 20, example: '2026-101' })
  matricula!: string;

  @ApiProperty({ type: String, maxLength: 150, example: 'Lucas Vitorino' })
  nome!: string;

  @ApiProperty({ type: String, maxLength: 60, example: 'Alfa' })
  grupo!: string;

  @ApiProperty({ type: [PresencaRelatorioFinalDto] })
  presencas!: PresencaRelatorioFinalDto[];

  @ApiProperty({
    type: Number,
    format: 'double',
    minimum: 0,
    maximum: 1,
    example: 0.8,
  })
  pontoExtra!: number;

  @ApiProperty({ type: String, maxLength: 10, example: 'ES 2026.2' })
  turma!: string;
}

export class TurmaRelatorioFinalDto {
  @ApiProperty({ type: String, maxLength: 10, example: 'ES 2026.2' })
  turma!: string;

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  totalParticipantes!: number;

  @ApiProperty({ type: [ParticipanteRelatorioFinalDto] })
  participantes!: ParticipanteRelatorioFinalDto[];
}
