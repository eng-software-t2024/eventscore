import { Test } from '@nestjs/testing';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BonificacoesController } from './bonificacoes.controller.js';
import { BonificacoesPenalidadesModule } from './bonificacoes-penalidades.module.js';
import { BonificacoesService } from './bonificacoes.service.js';
import { PenalidadesController } from './penalidades.controller.js';
import { PenalidadesService } from './penalidades.service.js';

describe('BonificacoesPenalidadesModule', () => {
  it('disponibiliza controllers e services sem acessar o banco', async () => {
    const module = await Test.createTestingModule({
      imports: [BonificacoesPenalidadesModule, PrismaModule, AuditoriaModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(BonificacoesController)).toBeInstanceOf(
      BonificacoesController,
    );
    expect(module.get(BonificacoesService)).toBeInstanceOf(BonificacoesService);
    expect(module.get(PenalidadesController)).toBeInstanceOf(
      PenalidadesController,
    );
    expect(module.get(PenalidadesService)).toBeInstanceOf(PenalidadesService);
    await module.close();
  });
});
