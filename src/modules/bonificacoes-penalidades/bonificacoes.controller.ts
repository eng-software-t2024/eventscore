import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  AtualizarBonificacoesDto,
  BonificacaoGrupoResumoDto,
} from './dto/bonificacao.dto.js';
import { BonificacoesService } from './bonificacoes.service.js';

@ApiTags('Bonificações')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErroPadraoDto })
@Controller('eventos/:eventoId/bonificacoes')
export class BonificacoesController {
  constructor(private readonly bonificacoes: BonificacoesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bonificações dos grupos do evento' })
  @ApiOkResponse({ type: BonificacaoGrupoResumoDto, isArray: true })
  list(@Param('eventoId', ParseIntPipe) eventId: number) {
    return this.bonificacoes.list(eventId);
  }

  @Put(':grupoId')
  @ApiOperation({ summary: 'Substituir bonificações de um grupo' })
  @ApiOkResponse({ type: BonificacaoGrupoResumoDto })
  replace(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Param('grupoId', ParseIntPipe) groupId: number,
    @Body() dto: AtualizarBonificacoesDto,
    @CurrentUserId() userId: number,
  ) {
    return this.bonificacoes.replaceForGroup(eventId, groupId, dto, userId);
  }
}
