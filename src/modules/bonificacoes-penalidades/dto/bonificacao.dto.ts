import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, Min } from 'class-validator';

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

export class AtualizarBonificacoesDto {
  @ApiProperty({ type: () => [BonificacaoEntradaDto] })
  @IsArray()
  @IsNotEmpty()
  bonificacoes: BonificacaoEntradaDto[];
}

export class BonificacaoResumoDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'integer', example: 1 })
  itemBonificacaoId: number;

  @ApiProperty({ example: 'Uniformização' })
  itemNome: string;

  @ApiProperty({ type: 'integer', example: 10 })
  teto: number;

  @ApiProperty({ type: 'integer', example: 1 })
  grupoId: number;

  @ApiProperty({ example: 'Alfa' })
  grupo: string;

  @ApiProperty({ type: 'integer', example: 8 })
  valor: number;
}
