import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErroPadraoDto } from '../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../common/dto/erro-validacao.dto.js';
import { AtualizarEventoDto } from '../modules/eventos/dto/atualizar-evento.dto.js';
import { CriarEventoDto } from '../modules/eventos/dto/criar-evento.dto.js';
import { EventoDetalheDto } from '../modules/eventos/dto/evento-detalhe.dto.js';
import { EventoResumoDto } from '../modules/eventos/dto/evento-resumo.dto.js';
import { AtualizarDesafioDto } from '../modules/desafios/dto/atualizar-desafio.dto.js';
import { CriarDesafioDto } from '../modules/desafios/dto/criar-desafio.dto.js';
import { DesafioDto } from '../modules/desafios/dto/desafio.dto.js';
import { PontoColocacaoDto } from '../modules/desafios/dto/ponto-colocacao.dto.js';
import { AtualizarGrupoDto } from '../modules/grupos/dto/atualizar-grupo.dto.js';
import { CriarGrupoDto } from '../modules/grupos/dto/criar-grupo.dto.js';
import { GrupoResumoDto } from '../modules/grupos/dto/grupo-resumo.dto.js';
import {
  BonificacaoEntradaDto,
  BonificacaoGrupoResumoDto,
  BonificacaoItemResumoDto,
} from '../modules/bonificacoes-penalidades/dto/bonificacao.dto.js';
import {
  AtualizarPenalidadeDto,
  CriarPenalidadeDto,
  PenalidadeResumoDto,
} from '../modules/bonificacoes-penalidades/dto/penalidade.dto.js';
import {
  ImportacaoConfirmadaDto,
  ImportacaoLinhaDto,
  ImportacaoPrevistaDto,
} from '../modules/participantes/dto/importacao.dto.js';
import { ParticipanteResumoDto } from '../modules/participantes/dto/participante-resumo.dto.js';
import { ParticipantesListagemDto } from '../modules/participantes/dto/participantes-listagem.dto.js';
import { ConfiguracaoEventoDto } from '../modules/configuracao/dto/configuracao-evento.dto.js';
import { ConversaoPontoExtraItemDto } from '../modules/configuracao/dto/conversao-ponto-extra-item.dto.js';
import { CriterioDesempateConfigDto } from '../modules/configuracao/dto/criterio-desempate-config.dto.js';
import { FatorPresencaItemDto } from '../modules/configuracao/dto/fator-presenca-item.dto.js';
import { ItemBonificacaoConfigDto } from '../modules/configuracao/dto/item-bonificacao-config.dto.js';
import { ResultadoSalvoDto } from '../modules/resultados/dto/resultado-salvo.dto.js';
import { ResultadoDto } from '../modules/resultados/dto/resultado.dto.js';
import { SalvarResultadoDto } from '../modules/resultados/dto/salvar-resultado.dto.js';

export function configurarSwagger(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EventScore API')
    .setDescription('API de apuração e gestão do EventScore (Arena Comp 2026)')
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Informe o JWT recebido em POST /api/v1/auth/login.',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    // Mantém disponíveis também os schemas usados nas respostas de erro.
    extraModels: [
      CriarEventoDto,
      AtualizarEventoDto,
      EventoResumoDto,
      EventoDetalheDto,
      PontoColocacaoDto,
      CriarDesafioDto,
      AtualizarDesafioDto,
      DesafioDto,
      CriarGrupoDto,
      AtualizarGrupoDto,
      GrupoResumoDto,
      BonificacaoEntradaDto,
      BonificacaoItemResumoDto,
      BonificacaoGrupoResumoDto,
      AtualizarPenalidadeDto,
      CriarPenalidadeDto,
      PenalidadeResumoDto,
      ParticipanteResumoDto,
      ParticipantesListagemDto,
      ImportacaoPrevistaDto,
      ImportacaoLinhaDto,
      ImportacaoConfirmadaDto,
      SalvarResultadoDto,
      ResultadoDto,
      ResultadoSalvoDto,
      ConfiguracaoEventoDto,
      ConversaoPontoExtraItemDto,
      ItemBonificacaoConfigDto,
      FatorPresencaItemDto,
      CriterioDesempateConfigDto,
      ErroPadraoDto,
      ErroValidacaoDto,
    ],
  });
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
