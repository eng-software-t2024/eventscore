import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ResultadosController } from './resultados.controller.js';
import { ResultadosModule } from './resultados.module.js';
import { ResultadosService } from './resultados.service.js';

describe('ResultadosModule', () => {
  it('disponibiliza controller e service sem acessar o banco', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuditoriaModule, ResultadosModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(ResultadosController)).toBeInstanceOf(
      ResultadosController,
    );
    expect(module.get(ResultadosService)).toBeInstanceOf(ResultadosService);
    await module.close();
  });
});
