import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DesafiosController } from './desafios.controller.js';
import { DesafiosModule } from './desafios.module.js';
import { DesafiosService } from './desafios.service.js';

describe('DesafiosModule', () => {
  it('disponibiliza controller e service sem acessar o banco', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, DesafiosModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(DesafiosController)).toBeInstanceOf(DesafiosController);
    expect(module.get(DesafiosService)).toBeInstanceOf(DesafiosService);
    await module.close();
  });
});
