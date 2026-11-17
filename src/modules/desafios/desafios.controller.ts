import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Desafios')
@ApiBearerAuth()
@Controller('eventos/:eventoId/desafios')
export class DesafiosController {}
