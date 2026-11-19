import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class BonificacaoEntradaDto {
  @ApiProperty({ type: 'integer', example: 1 })
  @IsInt()
  @Min(1)
  itemBonificacaoId: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 10 })
  @IsInt()
  @Min(0)
  valor: number;
}

export class BonificacaoGrupoResumoDto {
  @ApiProperty({ type: 'integer', example: 1 })
  grupoId: number;

  @ApiProperty({ type: () => [BonificacaoEntradaDto] })
  itens: BonificacaoEntradaDto[];

  @ApiProperty({ type: 'integer', example: 18 })
  total: number;
}
