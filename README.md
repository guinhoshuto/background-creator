# Background Creator

Backgrounds animados em **1920×1080**, feitos com Remotion, React e TypeScript. Ajuste os parâmetros no Studio ou por JSON e exporte um ciclo contínuo em MP4, WebM ou GIF, sem áudio.

## Começar

Use Node.js 22 ou superior e npm. No diretório do projeto:

```sh
npm ci
npm run studio
```

O primeiro render pode baixar o Chrome Headless Shell usado pelo Remotion. Para GIF e validação dos exports, instale também FFmpeg e FFprobe e deixe os executáveis no `PATH`. Se necessário, defina `FFMPEG_PATH` e `FFPROBE_PATH` com os caminhos completos dos executáveis.

Escolha uma composição no Studio e edite as propriedades no painel lateral. O preview respeita o formato selecionado: `webm` permite alpha, enquanto `mp4` e `gif` mostram o resultado sobre a cor de fundo.

| Composição | Movimento | Controles específicos |
| --- | --- | --- |
| `GradientLoop` | Manchas de gradiente com movimento orgânico | `scale` (0,25–3), `intensity` (0–2) |
| `ParticleLoop` | Partículas em trajetórias periódicas | `count` (1–600), `size` (0,5–24), `distribution` (`uniform` ou `center`) |
| `GeometricLoop` | Formas geométricas com rotação e deslocamento | `count` (1–100), `scale` (0,15–3) |

## Parâmetros e presets

As três composições compartilham estes parâmetros:

| Parâmetro | Padrão | Uso |
| --- | --- | --- |
| `durationSeconds` | `8` | Duração positiva do ciclo; arredondada para um número inteiro de frames |
| `colors` | Ciano, índigo e rosa | Paleta de 2 a 6 cores |
| `seed` | `1` | Inteiro que determina a distribuição reproduzível dos elementos |
| `transparent` | `false` | Remove o fundo quando `outputFormat` é `webm` |
| `backgroundColor` | `#0B0F19` | Cor opaca em hexadecimal `#RRGGBB`, aplicada nos exports opacos |
| `outputFormat` | `webm` | Formato do preview, que também determina o FPS |

Um arquivo de parâmetros pode conter somente as opções que você quer alterar; as demais recebem seus valores iniciais. Os exemplos em `presets/` oferecem três direções visuais:

- `gradient-aurora.json`: luzes suaves em ciano, violeta e rosa.
- `particles-alpha.json`: partículas sutis com alpha para composição sobre outros vídeos.
- `geometric-orbit.json`: formas geométricas em tons quentes sobre azul escuro.

```json
{
  "durationSeconds": 10,
  "seed": 42,
  "colors": ["#67E8F9", "#A78BFA", "#F9A8D4"],
  "scale": 1.2,
  "intensity": 0.9
}
```

## Exportar

Use os comandos oficiais para aplicar os presets de qualidade:

```sh
npm run render:mp4 -- GradientLoop --props presets/gradient-aurora.json
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json
npm run render:gif -- GeometricLoop --props presets/geometric-orbit.json
```

Você pode escolher destino, duração e seed:

```sh
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json --duration 12 --seed 2026 --out out/particles-12s.webm
```

O formato do comando substitui `outputFormat` do JSON; `--duration` e `--seed` substituem os respectivos valores. Sem `--out`, o destino é `out/<Composição>.<formato>`. Arquivos existentes são preservados; acrescente `--overwrite` para substituí-los intencionalmente. O terminal informa o número de frames e a duração efetiva antes do render.

No PowerShell, se o wrapper `npm.ps1` interpretar as opções como argumentos do npm, use `npm.cmd` nos mesmos comandos (por exemplo, `npm.cmd run render:mp4 -- GradientLoop --duration 8`).

| Formato | Perfil oficial | Alpha |
| --- | --- | --- |
| MP4 | H.264, 60 fps, CRF 1, `yuv420p`, preset `veryslow` | Composto sobre `backgroundColor` |
| WebM | VP9, 60 fps, CRF 0, `yuv420p` ou `yuva420p` | Preservado quando solicitado |
| GIF | 50 fps, paleta global de até 256 cores, dithering `sierra2_4a`, loop infinito | Composto sobre `backgroundColor` |

Todos os formatos mantêm 1920×1080 e usam intermediários PNG. GIF é produzido pelo FFmpeg em duas etapas: análise da sequência inteira para criar a paleta, seguida da aplicação da paleta com dithering. A cadência de 50 fps usa atrasos regulares de 20 ms.

Esses perfis priorizam qualidade e podem resultar em renders demorados e arquivos grandes. GIF tem limitações de cor e não preserva transparência parcial. MP4 não contém canal alpha. A exibição de alpha em WebM depende do reprodutor; um fundo preto em um player não prova ausência de alpha. O comando de validação decodifica com `libvpx-vp9` para verificar esse canal.

O diálogo de exportação manual do Studio permite configurações diferentes. Use os comandos acima para garantir os presets oficiais. Salve as alterações dos controles em **Save default props** para que os comandos também as utilizem, ou copie os valores para um JSON passado a `--props`. Alterações ainda não salvas ficam apenas no preview. O formato do comando e as opções explícitas do JSON/CLI prevalecem sobre os defaults salvos.

## Como o loop funciona

Cada composição usa exclusivamente o frame atual e uma seed. A duração define o período completo de todos os movimentos; funções periódicas mantêm a posição, a aparência e a velocidade contínuas na emenda. Partículas seguem trajetórias contínuas, sem desaparecer e reaparecer dentro da imagem.

Para um ciclo de `N` frames, o estado teórico do frame `N` coincide com o frame `0`. O arquivo contém somente `0…N−1`: incluir novamente o frame `0` no fim criaria uma pequena pausa. Portanto, o último frame visível não precisa ser uma cópia do primeiro; a passagem entre eles precisa corresponder a um avanço normal da animação.

MP4 e WebM contêm um ciclo; ative a repetição no aplicativo que os reproduzir. GIF já inclui repetição infinita. Para durações muito curtas, há poucos frames para representar o movimento; prefira vários segundos para um background suave.

## Desenvolvimento e validação

```sh
npm run typecheck
npm run lint
npm test
npm run validate:exports
```

Os testes verificam schemas, arredondamento de duração, presets, determinismo por seed e continuidade do movimento no encontro entre ciclos. A validação de exportação gera amostras reais em resolução integral e inspeciona codecs, dimensões, duração/FPS, repetição do GIF e alpha do WebM. FFmpeg e FFprobe são necessários para essa etapa.

São 12 amostras de 0,4 segundo: MP4, WebM opaco, WebM com alpha e GIF para cada composição. O relatório em `out/validation/report.json` registra cada arquivo aprovado, incluindo a comparação do primeiro frame decodificado com um PNG novo do Remotion, composto sobre fundos claro e escuro. Para amostras mais longas, use `npm.cmd run validate:exports -- --duration 8`. Para retomar uma verificação interrompida sem repetir os encodes existentes, acrescente `--reuse-existing`: os arquivos presentes serão novamente inspecionados e os ausentes serão renderizados. Após alterar animações ou presets de exportação, execute sem essa opção para gerar arquivos novos.

Para validar uma mudança visual, reproduza pelo menos dois ciclos no Studio. Inspecione especialmente a emenda, as bordas, sombras, cores e a composição sobre fundos claros e escuros quando houver alpha. Durações e seeds diferentes devem manter o loop contínuo.

### Adicionar uma composição

1. Crie um componente em `src/backgrounds/` e estenda `baseBackgroundSchema` com controles Zod e valores iniciais.
2. Separe o cálculo visual em uma função pura que receba props, frame e total de frames. Use `loopPhase` e a seed para movimento periódico e reproduzível; evite relógio, `Math.random()`, animações CSS ou estado acumulado entre frames.
3. No componente, leia `useCurrentFrame()` e `useVideoConfig()`, desenhe o resultado da função e use a mesma regra de fundo das composições existentes.
4. Registre componente, schema e valores iniciais em `src/catalog.tsx` e adicione uma `Composition` em `src/Root.tsx`, seguindo os exemplos e compartilhando seus metadados. Use `id="Nome"` e um objeto literal em `defaultProps` para permitir salvar os controles no Studio. O exporter lê os defaults efetivos da composição e aplica apenas os overrides solicitados.
5. Inclua a nova cena nos testes de periodicidade/determinismo e acrescente um preset JSON de exemplo. Valide a emenda e renderize uma amostra nos formatos necessários.

`src/settings.ts` concentra a regra de alpha, os metadados e os presets. Mantenha os pacotes Remotion na mesma versão exata e preserve o lockfile para instalações reproduzíveis.
