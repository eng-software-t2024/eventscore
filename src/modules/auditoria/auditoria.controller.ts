import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErroPadraoDto } from '../../common/dto/erro-padrao.dto.js';
import { ErroValidacaoDto } from '../../common/dto/erro-validacao.dto.js';
import { AuditoriaService } from './auditoria.service.js';
import { AuditoriaItemDto } from './dto/auditoria-item.dto.js';
import { ListarAuditoriaQueryDto } from './dto/listar-auditoria-query.dto.js';

@ApiTags('Auditoria')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Token ausente, inválido ou expirado.',
  type: ErroPadraoDto,
})
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly audit: AuditoriaService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar histórico de alterações de um registro',
    operationId: 'listarAuditoria',
  })
  @ApiOkResponse({
    description: 'Alterações da mais antiga para a mais recente.',
    type: AuditoriaItemDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Entidade ou identificador do registro inválidos.',
    type: ErroValidacaoDto,
  })
  list(@Query() query: ListarAuditoriaQueryDto): Promise<AuditoriaItemDto[]> {
    return this.audit.list(query.entidade, query.registroId);
  }
}
