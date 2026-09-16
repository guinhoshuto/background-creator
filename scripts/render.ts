import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {backgroundCatalog} from '../src/catalog';
import {outputFormatSchema} from '../src/settings';
import {exportBackground} from './export';

const main = async () => {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      format: {type: 'string', default: 'webm'},
      props: {type: 'string'}, out: {type: 'string'},
      duration: {type: 'string'}, seed: {type: 'string'},
      overwrite: {type: 'boolean', default: false},
      list: {type: 'boolean'}, help: {type: 'boolean', short: 'h'},
    },
  });
  if (values.help) {
    console.log('npm run render:<mp4|webm|gif> -- <composição> [--props arquivo.json] [--out destino] [--duration segundos] [--seed inteiro] [--overwrite]\n\nUse --list para listar as composições. O formato do comando prevalece sobre o JSON.');
    return;
  }
  if (values.list) {console.log(Object.keys(backgroundCatalog).join('\n')); return;}
  if (positionals.length > 1) throw new Error('Informe somente uma composição. Use --help.');
  const rawProps: unknown = values.props ? JSON.parse(await readFile(values.props, 'utf8')) : {};
  if (rawProps === null || Array.isArray(rawProps) || typeof rawProps !== 'object') throw new Error('O arquivo de parâmetros deve conter um objeto JSON.');
  await exportBackground({
    compositionId: positionals[0] ?? 'GradientLoop',
    format: outputFormatSchema.parse(values.format),
    props: {
      ...rawProps,
      ...(values.duration === undefined ? {} : {durationSeconds: Number(values.duration)}),
      ...(values.seed === undefined ? {} : {seed: Number(values.seed)}),
    },
    output: values.out, overwrite: values.overwrite,
  });
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
