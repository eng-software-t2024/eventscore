import { Prisma } from '../../generated/prisma/client.js';
import type {
  LinhaApuracaoParticipanteDto,
  ResumoApuracaoDto,
} from './dto/apuracao.dto.js';

export interface BaseParticipanteApuracao {
  id: number;
  matricula: string;
  nome: string;
  turma: string;
  grupoId: number;
  grupo: { nome: string };
}

export interface PresencaParticipanteApuracao {
  participanteId: number;
  diasPresentes: number | bigint;
  fator: Prisma.Decimal | null;
}

export function calculateIndividualResults(
  participants: BaseParticipanteApuracao[],
  attendance: PresencaParticipanteApuracao[],
  placements: Map<number, number>,
  conversions: Map<number, Prisma.Decimal>,
  totalDays: number,
): { linhas: LinhaApuracaoParticipanteDto[]; resumo: ResumoApuracaoDto } {
  const attendanceByParticipant = new Map(
    attendance.map((item) => [item.participanteId, item]),
  );
  const lines = participants.map((participant) => {
    const colocacaoGrupo = placements.get(participant.grupoId);
    if (colocacaoGrupo === undefined) {
      throw new Error('Classificação sem grupo de participante');
    }
    const groupScore = conversions.get(colocacaoGrupo) ?? new Prisma.Decimal(0);
    const participantAttendance = attendanceByParticipant.get(participant.id);
    const daysPresent = Number(participantAttendance?.diasPresentes ?? 0);
    const factor = participantAttendance?.fator ?? new Prisma.Decimal(0);
    const individualScore = groupScore
      .mul(factor)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      participanteId: participant.id,
      matricula: participant.matricula,
      nome: participant.nome,
      turma: participant.turma,
      grupo: participant.grupo.nome,
      colocacaoGrupo,
      pontoExtraGrupo: Number(groupScore.toString()),
      diasPresentes: daysPresent,
      diasTotais: totalDays,
      fator: Number(factor.toString()),
      pontoExtra: Number(individualScore.toString()),
    };
  });

  const totalParticipants = lines.length;
  const totalDaysPresent = lines.reduce(
    (total, line) => total + line.diasPresentes,
    0,
  );
  return {
    linhas: lines,
    resumo: {
      totalParticipantes: totalParticipants,
      assiduidade:
        totalParticipants > 0 && totalDays > 0
          ? totalDaysPresent / (totalParticipants * totalDays)
          : 0,
      aptos: lines.filter((line) => line.pontoExtra > 0).length,
    },
  };
}
