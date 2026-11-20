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

/** Item lançado, com o id do registro para consultar o histórico em GET /auditoria (RF18). */
export class BonificacaoItemResumoDto {
  @ApiProperty({
    type: 'integer',
    example: 21,
    description:
      'Id do lançamento, usado como registroId em GET /auditoria?entidade=BONIFICACAO_GRUPO.',
  })
  id: number;

  @ApiProperty({ type: 'integer', example: 1 })
  itemBonificacaoId: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 10 })
  valor: number;
}

export class BonificacaoGrupoResumoDto {
  @ApiProperty({ type: 'integer', example: 1 })
  grupoId: number;

  @ApiProperty({ type: () => [BonificacaoItemResumoDto] })
  itens: BonificacaoItemResumoDto[];

  @ApiProperty({ type: 'integer', example: 18 })
  total: number;
}
