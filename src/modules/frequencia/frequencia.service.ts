import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListarPresencasQueryDto } from './dto/listar-presencas-query.dto.js';
import type { PresencaGradeDto } from './dto/presenca-grade.dto.js';
import type { RegistrarPresencaDto } from './dto/registrar-presenca.dto.js';

@Injectable()
export class FrequenciaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    eventoId: number,
    diaId: number,
    query: ListarPresencasQueryDto,
  ): Promise<PresencaGradeDto> {
    await this.assertEvento(eventoId);
    await this.assertDia(eventoId, diaId);
    const busca = query.busca?.trim();
    const where = {
      eventoId,
      ...(query.grupoId === undefined ? {} : { grupoId: query.grupoId }),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' as const } },
              { matricula: { contains: busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const participantes = await this.prisma.participante.findMany({
      where,
      orderBy: [{ turma: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
      include: {
        grupo: { select: { id: true, nome: true } },
        presencas: { where: { diaId }, select: { presente: true } },
      },
    });
    const dados = participantes.map((participante) => ({
      participanteId: participante.id,
      matricula: participante.matricula,
      nome: participante.nome,
      turma: participante.turma,
      grupoId: participante.grupo.id,
      grupo: participante.grupo.nome,
      presente: participante.presencas[0]?.presente ?? false,
    }));
    const presentes = dados.filter((item) => item.presente).length;
    return {
      dados,
      resumo: {
        total: dados.length,
        presentes,
        ausentes: dados.length - presentes,
      },
    };
  }

  async registrar(
    eventoId: number,
    diaId: number,
    participanteId: number,
    dto: RegistrarPresencaDto,
  ) {
    await this.assertEvento(eventoId);
    await this.assertDia(eventoId, diaId);
    await this.assertParticipante(eventoId, participanteId);
    const presenca = await this.prisma.presenca.upsert({
      where: { diaId_participanteId: { diaId, participanteId } },
      create: { eventoId, diaId, participanteId, presente: dto.presente },
      update: { presente: dto.presente },
    });
    return {
      participanteId: presenca.participanteId,
      presente: presenca.presente,
    };
  }

  private async assertEvento(eventoId: number): Promise<void> {
    if (!(await this.prisma.evento.findUnique({ where: { id: eventoId } }))) {
      throw new NotFoundException('Evento não encontrado');
    }
  }

  private async assertDia(eventoId: number, diaId: number): Promise<void> {
    if (
      !(await this.prisma.diaEvento.findFirst({
        where: { id: diaId, eventoId },
      }))
    ) {
      throw new NotFoundException('Dia não encontrado neste evento');
    }
  }

  private async assertParticipante(
    eventoId: number,
    participanteId: number,
  ): Promise<void> {
    if (
      !(await this.prisma.participante.findFirst({
        where: { id: participanteId, eventoId },
      }))
    ) {
      throw new NotFoundException('Participante não encontrado neste evento');
    }
  }
}
