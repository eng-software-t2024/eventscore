import { PartialType } from '@nestjs/swagger';
import { CriarDesafioDto } from './criar-desafio.dto.js';

export class AtualizarDesafioDto extends PartialType(CriarDesafioDto, {
  skipNullProperties: false,
}) {}
