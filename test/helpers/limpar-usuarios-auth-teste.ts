import type { PrismaService } from '../../src/prisma/prisma.service.js';

/** Limpa sessões/eventos das fixtures descartáveis. Preserva usuário com referências de negócio append-only. */
export async function limparUsuariosAuthTeste(
  prisma: PrismaService,
  ids: number[],
) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.telemetryEvent.deleteMany({
      where: { usuarioId: { in: uniqueIds } },
    });
    await tx.authSession.deleteMany({
      where: { usuarioId: { in: uniqueIds } },
    });
    const candidates: number[] = [];
    for (const id of uniqueIds) {
      const [businessAudit, apuracoes, desempates, administrativeAudit] =
        await Promise.all([
          tx.auditoria.count({ where: { usuarioId: id } }),
          tx.apuracao.count({ where: { usuarioId: id } }),
          tx.desempateManual.count({ where: { usuarioId: id } }),
          tx.adminAuditEvent.count({ where: { actorUserId: id } }),
        ]);
      if (
        businessAudit === 0 &&
        apuracoes === 0 &&
        desempates === 0 &&
        administrativeAudit === 0
      )
        candidates.push(id);
    }
    if (candidates.length)
      await tx.usuario.deleteMany({ where: { id: { in: candidates } } });
  });
}
