import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AtualizarDiaEventoDto } from './dto/atualizar-dia-evento.dto.js';
import { CriarDiaEventoDto } from './dto/criar-dia-evento.dto.js';
import { DiaEventoResponseDto } from './dto/dia-evento-response.dto.js';
import { formatDateOnly, parseDateOnly } from './date-only.js';

type EventoPeriodo = {
  idEvento: number;
  dataInicio: Date;
  dataFim: Date;
  quantidadeDias: number;
};

@Injectable()
export class DiasEventoService {
  private readonly logger = new Logger(DiasEventoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    eventoId: number,
    dto: CriarDiaEventoDto,
  ): Promise<DiaEventoResponseDto> {
    const evento = await this.getEventoOrThrow(eventoId);
    const data = parseDateOnly(dto.data);
    this.validateDay(evento, dto.numeroDia, data);
    await this.ensureUnique(eventoId, dto.numeroDia, data);

    try {
      const dia = await this.prisma.diaEvento.create({
        data: { idEvento: eventoId, numeroDia: dto.numeroDia, data },
      });
      return this.toResponse(dia);
    } catch (error) {
      this.throwConflictForUnique(error);
      throw error;
    }
  }

  async findAll(eventoId: number): Promise<DiaEventoResponseDto[]> {
    await this.getEventoOrThrow(eventoId);
    const dias = await this.prisma.diaEvento.findMany({
      where: { idEvento: eventoId },
      orderBy: [{ data: 'asc' }, { numeroDia: 'asc' }],
    });
    return dias.map((dia) => this.toResponse(dia));
  }

  async update(
    eventoId: number,
    diaId: number,
    dto: AtualizarDiaEventoDto,
  ): Promise<DiaEventoResponseDto> {
    const evento = await this.getEventoOrThrow(eventoId);
    const atual = await this.prisma.diaEvento.findFirst({
      where: { idDia: diaId, idEvento: eventoId },
    });
    if (!atual) throw new NotFoundException('Dia do evento não encontrado');
    if (dto.numeroDia === undefined && dto.data === undefined) {
      throw new BadRequestException('Informe numeroDia ou data para atualizar');
    }

    const numeroDia = dto.numeroDia ?? atual.numeroDia;
    const data = dto.data === undefined ? atual.data : parseDateOnly(dto.data);
    this.validateDay(evento, numeroDia, data);
    await this.ensureUnique(eventoId, numeroDia, data, diaId);

    try {
      const dia = await this.prisma.diaEvento.update({
        where: { idDia: diaId },
        data: { numeroDia, data },
      });
      return this.toResponse(dia);
    } catch (error) {
      this.throwConflictForUnique(error);
      throw error;
    }
  }

  async remove(eventoId: number, diaId: number): Promise<void> {
    await this.getEventoOrThrow(eventoId);
    const dia = await this.prisma.diaEvento.findFirst({
      where: { idDia: diaId, idEvento: eventoId },
    });
    if (!dia) throw new NotFoundException('Dia do evento não encontrado');
    if (await this.hasDependentRecords(diaId, eventoId)) {
      throw new ConflictException(
        'O dia não pode ser excluído porque possui registros associados.',
      );
    }

    try {
      await this.prisma.diaEvento.delete({ where: { idDia: diaId } });
    } catch (error) {
      this.throwConflictForForeignKey(error);
      throw error;
    }
  }

  private async getEventoOrThrow(eventoId: number): Promise<EventoPeriodo> {
    const evento = await this.prisma.evento.findUnique({
      where: { idEvento: eventoId },
      select: {
        idEvento: true,
        dataInicio: true,
        dataFim: true,
        quantidadeDias: true,
      },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');
    return evento;
  }

  private validateDay(evento: EventoPeriodo, numeroDia: number, data: Date) {
    if (!Number.isInteger(numeroDia) || numeroDia < 1) {
      throw new BadRequestException(
        'numeroDia deve ser um inteiro maior ou igual a 1',
      );
    }
    if (data < evento.dataInicio || data > evento.dataFim) {
      throw new UnprocessableEntityException(
        'A data deve estar dentro do período do evento',
      );
    }
    if (numeroDia > evento.quantidadeDias) {
      throw new UnprocessableEntityException(
        'O número do dia excede a quantidade configurada para o evento.',
      );
    }
  }

  private async ensureUnique(
    eventoId: number,
    numeroDia: number,
    data: Date,
    exceptId?: number,
  ) {
    const where = {
      idEvento: eventoId,
      ...(exceptId === undefined ? {} : { NOT: { idDia: exceptId } }),
    };
    const [sameNumber, sameDate] = await Promise.all([
      this.prisma.diaEvento.findFirst({ where: { ...where, numeroDia } }),
      this.prisma.diaEvento.findFirst({ where: { ...where, data } }),
    ]);
    if (sameNumber)
      throw new ConflictException(
        'Já existe um dia com este número neste evento.',
      );
    if (sameDate) throw new ConflictException('data já existe neste evento');
  }

  private toResponse(dia: { idDia: number; numeroDia: number; data: Date }) {
    return {
      id: dia.idDia,
      numeroDia: dia.numeroDia,
      data: formatDateOnly(dia.data),
    };
  }

  private throwConflictForUnique(error: unknown): void {
    if (this.isPrismaCode(error, 'P2002')) {
      throw new ConflictException(
        'Já existe um dia com este número ou data neste evento.',
      );
    }
  }

  private throwConflictForForeignKey(error: unknown): void {
    if (this.isPrismaCode(error, 'P2003')) {
      throw new ConflictException('O dia possui registros associados');
    }
  }

  private isPrismaCode(error: unknown, code: string): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === code,
    );
  }

  private async hasDependentRecords(idDia: number, idEvento: number) {
    let tables: { table_name: string }[];
    try {
      tables = await this.prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('presenca', 'desafio')
      `;
    } catch (error) {
      this.logger.error(
        'Não foi possível consultar as estruturas de dependência para exclusão',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
      );
    }

    const expectedTables = new Set(['presenca', 'desafio']);
    const availableTables = new Set(tables.map(({ table_name }) => table_name));
    const missingTables = [...expectedTables].filter(
      (table) => !availableTables.has(table),
    );
    if (missingTables.length > 0) {
      this.logger.error(
        `Estruturas de dependência ausentes para exclusão: ${missingTables.join(', ')}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
      );
    }

    for (const { table_name: table } of tables) {
      // Os nomes são constantes, definidos pela V2/V4 oficiais; nenhum input
      // externo é interpolado como identificador.
      let rows: { exists: boolean }[];
      try {
        rows = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS (
             SELECT 1 FROM ${table}
             WHERE id_dia = $1 AND id_evento = $2
           ) AS exists`,
          idDia,
          idEvento,
        );
      } catch (error) {
        this.logger.error(
          `Não foi possível consultar a dependência ${table} para exclusão`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new ServiceUnavailableException(
          'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
        );
      }
      if (rows[0]?.exists) return true;
    }
    return false;
  }
}
