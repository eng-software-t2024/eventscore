import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaController } from './auditoria.controller.js';
import { AuditoriaModule } from './auditoria.module.js';
import { AuditoriaService } from './auditoria.service.js';

describe('AuditoriaModule', () => {
  it('disponibiliza controller e service sem acessar o banco', async () => {
    const module = await Test.createTestingModule({
      imports: [AuditoriaModule, PrismaModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(AuditoriaController)).toBeInstanceOf(AuditoriaController);
    expect(module.get(AuditoriaService)).toBeInstanceOf(AuditoriaService);
    await module.close();
  });
});
