import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ConversaoPontoExtraItemDto } from './conversao-ponto-extra-item.dto.js';
import { CriterioDesempateConfigDto } from './criterio-desempate-config.dto.js';
import { FatorPresencaItemDto } from './fator-presenca-item.dto.js';
import { ItemBonificacaoConfigDto } from './item-bonificacao-config.dto.js';

const MAX_POSTGRES_INT = 2_147_483_647;

/**
 * Configuração de pontuação do evento (RF02). O GET devolve e o PUT substitui
 * tudo de uma vez, porque a tela grava num único botão.
 */
export class ConfiguracaoEventoDto {
  @ApiProperty({
    description:
      'Ponto extra por colocação final: uma linha por grupo do evento, colocações 1..N.',
    type: [ConversaoPontoExtraItemDto],
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ConversaoPontoExtraItemDto)
  conversaoPontoExtra: ConversaoPontoExtraItemDto[];

  @ApiProperty({
    description:
      'Itens de bonificação com teto. Item sem id é criado; item cadastrado que não vier na lista é excluído.',
    type: [ItemBonificacaoConfigDto],
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ItemBonificacaoConfigDto)
  itensBonificacao: ItemBonificacaoConfigDto[];

  @ApiProperty({
    description:
      'Valor mínimo de uma penalidade. null enquanto a faixa não estiver configurada; nulo ou preenchido junto com penalidadeMax.',
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 10,
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INT)
  penalidadeMin: number | null;

  @ApiProperty({
    description:
      'Valor máximo de uma penalidade. null enquanto a faixa não estiver configurada; nulo ou preenchido junto com penalidadeMin.',
    type: 'integer',
    nullable: true,
    minimum: 0,
    maximum: MAX_POSTGRES_INT,
    example: 50,
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_POSTGRES_INT)
  penalidadeMax: number | null;

  @ApiProperty({
    description:
      'Fator de presença para cada quantidade de dias presentes, de 0 até a quantidade de dias do evento.',
    type: [FatorPresencaItemDto],
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => FatorPresencaItemDto)
  fatoresPresenca: FatorPresencaItemDto[];

  @ApiProperty({
    description:
      'Critérios de desempate em ordem. MAIOR_PONTUACAO_DESAFIO pode se repetir com desafios diferentes (Regimento, art. 16).',
    type: [CriterioDesempateConfigDto],
  })
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CriterioDesempateConfigDto)
  criteriosDesempate: CriterioDesempateConfigDto[];
}
