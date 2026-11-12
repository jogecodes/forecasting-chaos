import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog, defaultLanguage, currentLanguage, translate } from '../src/i18n.js';

const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('all message translations preserve template values in Spanish and French', () => {
  assert.ok(Object.keys(catalog).length > 300);
  for (const [source, translations] of Object.entries(catalog)) {
    for (const locale of ['es', 'fr']) {
      assert.ok(translations[locale]?.trim(),`${locale}: ${source}`);
      assert.deepEqual(placeholders(translations[locale]),placeholders(source),`${locale}: ${source}`);
    }
    assert.equal(translate(source,'en'),source);
  }
});

test('dynamic forecasts translate nested labels while retaining numerical values', () => {
  const source = 'Run 3 · 2,501 forecast samples · Neural seeds 7 / 11 / 23 · No truth updates · 25 native time units saved';
  assert.equal(translate(source,'es'),'Simulación 3 · 2,501 muestras de predicción · Semillas neuronales 7 / 11 / 23 · Sin correcciones de referencia · 25 unidades de tiempo propias guardadas');
  assert.equal(translate('FORECAST / POLYNOMIAL DYNAMICS','fr'),'PRÉVISION / DYNAMIQUE POLYNOMIALE');
  assert.equal(translate('Mismatch onset: 14.00 · Confirmed at: 14.80','es'),'Inicio de la discrepancia: 14.00 · Confirmado en: 14.80');
  assert.equal(translate('0.00123 rod lengths','fr'),'0.00123 longueurs de tige');
  assert.equal(translate('GRU becomes invalid or unstable at 2.00 seconds. Playback stops before that state; the full-forecast score is unavailable.','fr'),'GRU produit un état invalide ou instable à 2.00 secondes. La lecture s’arrête avant cet état ; le résultat sur l’horizon complet est indisponible.');
});

test('all physical model methods translate fully, including embedded saved metadata', async () => {
  const manifest = JSON.parse(await readFile(new URL('../data/manifest.json',import.meta.url),'utf8'));
  for (const config of Object.values(manifest.physicalForecasts)) {
    for (const model of Object.values(config.models)) {
      assert.ok(catalog[model.method],model.label);
      for (const locale of ['es','fr']) assert.notEqual(translate(model.method,locale),model.method);
    }
  }
});

test('English is always the initial language and manual translations remain available', () => {
  assert.equal(defaultLanguage,'en');
  assert.equal(currentLanguage(),'en');
  assert.equal(translate('Prediction has'),'Prediction has');
  assert.equal(translate('Prediction has','es'),'La predicción');
  assert.equal(translate('Prediction has','fr'),'La prévision');
  assert.equal(translate('hard limits.','fr'),'a ses limites.');
  assert.equal(translate('θ₁ / ω₁ = 0.000067','es'),'θ₁ / ω₁ = 0.000067');
});

test('every static prose and accessibility label has both translations', async () => {
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  const prose = html.replace(/<math\b[\s\S]*?<\/math>/g,'').replace(/<script\b[\s\S]*?<\/script>/g,'');
  const texts = prose.split(/<[^>]*>/g).map(text=>text.trim()).filter(text=>/[A-Za-zÀ-ÿ]/.test(text));
  for (const match of html.matchAll(/(?:aria-label|aria-valuetext)="([^"]+)"/g)) texts.push(match[1]);
  const invariant = new Set(['chaos','chaos↗','JORGE CASAJÚS-SETIÉN','Lorenz','Rössler','Lorenz:','Rössler:','Transformer','GRU','MLP','A','B','ES','EN','FR','Español','English','Français']);
  for (const source of texts) {
    if (invariant.has(source)||/^(?:t = )?[\d.eE−+\-\s×½]+(?: s)?$/.test(source)||source.startsWith('dx/dt ='))continue;
    for (const locale of ['es','fr']) assert.ok(catalog[source]?.[locale] || translate(source,locale)!==source,`${locale}: ${source}`);
  }
});

test('physical forecaster defaults to Transformer in the initial document', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const select=html.match(/<select id="physical-forecast-model">([\s\S]*?)<\/select>/)[1];
  assert.match(select,/<option value="transformer" selected>/);
  assert.doesNotMatch(select,/<option value="mlp" selected>/);
});
