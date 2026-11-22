import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parametrosTelemetria } from './telemetry-query.ts';

test('exportação conserva o tipo selecionado na tela', () => {
  const params = new URLSearchParams(parametrosTelemetria('TAB_VISIBILITY'));
  assert.equal(params.get('limite'), '100');
  assert.equal(params.get('tipo'), 'TAB_VISIBILITY');
});

test('exportação sem filtro não restringe o tipo', () => {
  const params = new URLSearchParams(parametrosTelemetria(''));
  assert.equal(params.get('limite'), '100');
  assert.equal(params.has('tipo'), false);
});
