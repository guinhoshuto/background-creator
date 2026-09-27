import {readFile} from 'node:fs/promises';
import {exportAsset} from './export';
import {buildExportOptions, HELP_TEXT, listText, parseRenderArgs} from './render-args';

const main = async () => {
  const {values, positionals} = parseRenderArgs(process.argv.slice(2));
  if (values.help) {console.log(HELP_TEXT); return;}
  if (values.list) {console.log(listText()); return;}
  const rawProps: unknown = values.props ? JSON.parse(await readFile(values.props, 'utf8')) : {};
  await exportAsset(buildExportOptions({values, positionals}, rawProps));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
