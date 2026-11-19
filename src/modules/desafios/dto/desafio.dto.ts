import { ApiProperty } from '@nestjs/swagger';
import { PontoColocacaoDto } from './ponto-colocacao.dto.js';

export class DesafioDto {
  @ApiProperty({
    description: 'Identificador numérico único do desafio.',
    type: 'integer',
    minimum: 1,
    example: 3,
  })
  id: number;

  @ApiProperty({
    description: 'Nome identificador do desafio.',
    example: 'Hackathon',
  })
  nome: string;

  @ApiProperty({
    description: 'Retorna string vazia quando a coluna do banco é null.',
    example: 'Desenvolvimento em equipe',
  })
  descricao: string;

  @ApiProperty({
    description: 'Identificador do dia do evento vinculado ao desafio.',
    type: 'integer',
    minimum: 1,
    example: 2,
  })
  diaId: number;

  @ApiProperty({
    description:
      'Tabela de pontos por colocação ordenada crescentemente por colocacao.',
    type: [PontoColocacaoDto],
  })
  pontosColocacao: PontoColocacaoDto[];
}
