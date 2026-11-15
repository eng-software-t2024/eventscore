import { ApiProperty } from '@nestjs/swagger';

export class PresencaGradeItemDto {
  @ApiProperty() participanteId: number;
  @ApiProperty() matricula: string;
  @ApiProperty() nome: string;
  @ApiProperty() turma: string;
  @ApiProperty() grupoId: number;
  @ApiProperty() grupo: string;
  @ApiProperty() presente: boolean;
}

export class PresencaResumoDto {
  @ApiProperty() total: number;
  @ApiProperty() presentes: number;
  @ApiProperty() ausentes: number;
}

export class PresencaGradeDto {
  @ApiProperty({ type: [PresencaGradeItemDto] }) dados: PresencaGradeItemDto[];
  @ApiProperty({ type: PresencaResumoDto }) resumo: PresencaResumoDto;
}
