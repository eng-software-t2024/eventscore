import {
  Body,
  Controller,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  BonificacaoEntradaDto,
  BonificacaoGrupoResumoDto,
} from './dto/bonificacao.dto.js';
import { BonificacoesService } from './bonificacoes.service.js';

const parseBonificacoesArrayPipe = new ParseArrayPipe({
  items: BonificacaoEntradaDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: false,
  transformOptions: { enableImplicitConversion: false },
});

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
  @ApiBody({ type: BonificacaoEntradaDto, isArray: true })
  @ApiOkResponse({ type: BonificacaoGrupoResumoDto })
  replace(
    @Param('eventoId', ParseIntPipe) eventId: number,
    @Param('grupoId', ParseIntPipe) groupId: number,
    @Body(parseBonificacoesArrayPipe) bonificacoes: BonificacaoEntradaDto[],
    @CurrentUserId() userId: number,
  ) {
    return this.bonificacoes.replaceForGroup(
      eventId,
      groupId,
      bonificacoes,
      userId,
    );
  }
}
