import 'reflect-metadata';
import { stdin, stdout } from 'node:process';
import * as argon2 from 'argon2';
import { executarScript } from './prisma-script.js';

function perguntarOculto(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function')
    throw new Error('O bootstrap MASTER exige terminal interativo.');
  return new Promise((resolve, reject) => {
    const previous = stdin.isRaw;
    let value = '';
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (error?: Error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(previous ?? false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') return finish(new Error('Bootstrap cancelado.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b')
          value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const nome = process.env.MASTER_NOME?.trim();
const email = process.env.MASTER_EMAIL?.trim().toLowerCase();
if (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Defina MASTER_NOME e MASTER_EMAIL válidos.');
if (
  process.env.NODE_ENV === 'production' &&
  process.env.MASTER_BOOTSTRAP_APPROVED !== 'true'
) {
  throw new Error(
    'Bootstrap em produção exige aprovação explícita no procedimento da janela.',
  );
}

const senha = await perguntarOculto('Senha MASTER (mínimo 12 caracteres): ');
const confirmacao = await perguntarOculto('Confirme a senha MASTER: ');
if (senha.length < 12 || senha.length > 128)
  throw new Error('A senha deve ter entre 12 e 128 caracteres.');
if (senha !== confirmacao) throw new Error('As senhas não coincidem.');

await executarScript('criar-master', async (prisma) => {
  const existing = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existing)
    throw new Error(
      'Já existe uma conta com o e-mail MASTER informado; nenhuma conta foi alterada.',
    );
  const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
  const user = await prisma.usuario.create({
    data: { nome, email, senhaHash, perfil: 'MASTER', ativo: true },
    select: { id: true, perfil: true, ativo: true },
  });
  console.log(
    `[criar-master] conta ${user.perfil} criada; ativo=${user.ativo}.`,
  );
});
