import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfiguracaoController } from './configuracao.controller.js';
import { ConfiguracaoModule } from './configuracao.module.js';
import { ConfiguracaoService } from './configuracao.service.js';

describe('ConfiguracaoModule', () => {
  it('disponibiliza controller e service sem acessar o banco', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, ConfiguracaoModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(ConfiguracaoController)).toBeInstanceOf(
      ConfiguracaoController,
    );
    expect(module.get(ConfiguracaoService)).toBeInstanceOf(ConfiguracaoService);
    await module.close();
  });
});
