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
| `HalloweenLoop` | Noite ilustrada com lua, morcegos, névoa e abóboras iluminadas | `batCount` (0–18), `emberCount` (0–120), `fogIntensity` (0–1), `moonScale` (0,5–1,5) |
| `CobwebLoop` | Teias de aranha nos cantos, com orvalho, fios de seda e aranha pendurada | `webCount` (0–4), `strandCount` (0–24), `moteCount` (0–120), `spiderCount` (0–3), `dewIntensity` (0–1), `mistIntensity` (0–1) |
| `KawaiiLoop` | Nuvens, corações e estrelas pastel em grupos, com o miolo livre | `familyCount` (2–6), `familyScale` (0,7–1,4), `centerClearance` (0–1), `drift` (0–1), `sparkleTrail` (0–4) |
| `SunburstLoop` | Leque de raios que partem do centro, com gradiente do miolo para fora | `rayCount` (6–48), `rayWidth` (0,15–0,8), `swirl` (0–1), `spin` (−24–24, inteiro), `coreFade` (0–1), `coreShade` (0–1) |
| `GradientLoop` | Manchas de gradiente com movimento orgânico | `scale` (0,25–3), `intensity` (0–2) |
| `ParticleLoop` | Partículas em trajetórias periódicas | `count` (1–600), `size` (0,5–24), `distribution` (`uniform` ou `center`) |
| `GeometricLoop` | Formas geométricas com rotação e deslocamento | `count` (1–100), `scale` (0,15–3) |

## Parâmetros e presets

Todas as composições compartilham estes parâmetros. `HalloweenLoop`, `CobwebLoop` e `KawaiiLoop` começam com 12 segundos e `SunburstLoop` com 10; as quatro têm paleta e cor de fundo próprias, e `CobwebLoop`, `KawaiiLoop` e `SunburstLoop` também trazem a própria seed. As composições de gradiente, partículas e geometria usam os padrões abaixo:

| Parâmetro | Padrão | Uso |
| --- | --- | --- |
| `durationSeconds` | `8` | Duração positiva do ciclo; arredondada para um número inteiro de frames |
| `colors` | Ciano, índigo e rosa | Paleta de 2 a 6 cores |
| `seed` | `1` | Inteiro que determina a distribuição reproduzível dos elementos |
| `transparent` | `false` | Remove o fundo quando `outputFormat` é `webm` |
| `backgroundColor` | `#0B0F19` | Cor opaca em hexadecimal `#RRGGBB`, aplicada nos exports opacos |
| `outputFormat` | `webm` | Formato do preview, que também determina o FPS |

Um arquivo de parâmetros pode conter somente as opções que você quer alterar; as demais recebem seus valores iniciais. Os exemplos em `presets/` oferecem estas direções visuais:

- `halloween-midnight.json`: noite em violeta escuro, lua cremosa, abóboras âmbar e centro livre para conteúdo.
- `halloween-cobweb.json`: teias enluaradas em seda prateada, orvalho brilhante e um calor âmbar no rodapé.
- `kawaii-constelacao.json`: nuvens, corações e estrelas em grupos, sobre leite morno, em ritmo lento.
- `sunburst-crimson.json`: leque de vermelho sobre vermelho escuro, o contraste mais baixo da série.
- `sunburst-sand.json`: raios largos de areia sobre creme, em ritmo mais lento.
- `sunburst-ocean.json`: raios finos de azul sobre azul-noite, com o miolo mais fechado.
- `sunburst-moss.json`: verde musgo sobre verde escuro, no ciclo mais longo.
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
npm run render:mp4 -- HalloweenLoop --props presets/halloween-midnight.json
npm run render:webm -- CobwebLoop --props presets/halloween-cobweb.json
npm run render:webm -- KawaiiLoop --props presets/kawaii-constelacao.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-crimson.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-sand.json
npm run render:webm -- SunburstLoop --props presets/sunburst-ocean.json
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

## Halloween: noite de outono

Selecione `HalloweenLoop` no Studio. O preset `presets/halloween-midnight.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM, com os principais elementos concentrados nas bordas. Não há texto, imagens externas, fontes adicionais ou áudio.

A lua tem halo e crateras sutis; os morcegos descrevem trajetórias fechadas com batidas de asas; névoa, galhos e luzes flutuantes se movem lentamente. As abóboras permanecem ancoradas ao chão e variam a luz interna suavemente. A seed controla estrelas, morcegos e luzes; alterar a quantidade de uma camada não reorganiza as outras.

`colors[0]` controla névoa e atmosfera, `colors[1]` o luar e as luzes, e `colors[2]` as abóboras. Se usar apenas duas cores, as abóboras adotam a primeira. `batCount: 0` e `emberCount: 0` ocultam essas camadas; `fogIntensity: 0` remove a névoa. `moonScale` altera o tamanho da lua e de seu halo.

Com `transparent: true` e `outputFormat: "webm"`, o céu de fundo desaparece, preservando lua, estrelas, cenário, abóboras e névoa com alpha. Em MP4/GIF, todos os elementos continuam compostos sobre `backgroundColor`.

## Halloween: teias de aranha

Selecione `CobwebLoop` no Studio. O preset `presets/halloween-cobweb.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM, com as teias concentradas nos quatro cantos e o miolo do quadro livre de elementos grandes; apenas a poeira e a névoa atravessam o quadro inteiro, em brilho baixo. Os valores iniciais próprios da composição são `seed: 47`, `backgroundColor: #100B1B` e a paleta abaixo. Não há texto, imagens externas, fontes adicionais ou áudio.

Cada teia nasce de fios radiais e de anéis concêntricos que cedem na direção do miolo da teia, ancorado no canto, com rasgos, um fio rompido pendurado com uma gota na ponta e pequenas irregularidades definidos pela seed; a geometria não muda durante o ciclo. Os raios sempre terminam no anel externo, que nunca é rasgado, então nenhum fio fica com a ponta solta no ar. As teias derivam, balançam e respiram devagar, cada uma no seu ritmo e amplitude, o orvalho cintila sobre os fios, os fios de seda pendurados nas bordas oscilam com uma gota na ponta, a poeira flutua e a aranha desce e sobe no próprio fio articulando as pernas.

`colors[0]` controla a seda e a névoa, `colors[1]` o luar, os brilhos e o orvalho, e `colors[2]` o calor âmbar da luz baixa, da poeira, da marca da aranha e de algumas gotas; os núcleos das gotas e da poeira seguem `colors[1]`. Se usar apenas duas cores, o âmbar adota a primeira. A seed define a geometria das teias, os fios soltos, a poeira e o cintilar do orvalho; a névoa e as aranhas ocupam posições fixas. `webCount` escolhe quantos cantos recebem teia, na ordem superior esquerdo, superior direito, inferior direito e inferior esquerdo; `webCount: 0` remove as teias e, com elas, o orvalho. `strandCount: 0`, `moteCount: 0` e `spiderCount: 0` ocultam essas camadas; `dewIntensity: 0` apaga o orvalho e `mistIntensity: 0` remove a névoa. Alterar a quantidade de uma camada não reorganiza as outras.

Com `transparent: true` e `outputFormat: "webm"`, o céu de fundo e a vinheta desaparecem, preservando teias, orvalho, fios, aranhas, poeira e névoa com alpha; o luar e a luz âmbar continuam presentes como brilho. Em MP4/GIF, todos os elementos são compostos sobre `backgroundColor`.

## Kawaii: constelação pastel

Selecione `KawaiiLoop` no Studio. O preset `presets/kawaii-constelacao.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM. Os valores iniciais próprios da composição são `seed: 7`, `backgroundColor: #FFF7F4` e a paleta de morango, baunilha e matchá. Não há personagens, texto, imagens externas, fontes adicionais ou áudio.

O vocabulário é nuvem, coração e estrela, em três silhuetas de nuvem, dois corações (cheio e vazado) e três estrelas (cheia, cintilo de quatro pontas e vazada). As peças nunca aparecem sozinhas: elas vêm em **grupos**, e cada grupo é um acorde de nuvem mais acentos numa escada de tamanhos áurea, 1 : 0,618 : 0,382 : 0,236. São três acordes diferentes, então um grupo nunca é a cópia do vizinho.

A diferença em relação a um campo de peças espalhadas é que **o arranjo é escrito à mão**: uma tabela define o rumo, a profundidade e a inclinação de cada grupo, e a seed não move nenhuma peça de lugar. Trocar a seed muda o baile, nunca o arranjo. Quatro regras sustentam a composição:

- **O vão antecede a nota.** O peso de cada grupo é derivado da lacuna angular que o precede: silêncio grande anuncia nota grande. O espaço negativo vira hierarquia em vez de sobra.
- **Três distâncias.** Cada grupo pertence a um plano com banda própria de escala, opacidade, brilho e paralaxe. O fundo é maior, mais pálido e quase parado; a frente é menor, nítida e deriva bem mais.
- **Equilíbrio de alavanca.** A tabela é ordenada em pares opostos e o centro de massa é conferido por número: a partir de quatro grupos o quadro fecha a menos de 8% da meia-tela. Com dois ou três grupos sobra uma inclinação deliberada, que é diagonal e não desequilíbrio.
- **A onda atravessa o quadro.** A defasagem do movimento vem de onde a peça está, não de um sorteio, então a respiração viaja pela composição em vez de cada peça piscar por conta própria.

`colors[0]`, `colors[1]` e `colors[2]` são morango, baunilha e matchá. Cada grupo canta um acorde de duas vozes e o acorde gira uma casa por grupo, então o motivo volta sem repetir e a regra vale para qualquer paleta de 2 a 6 cores.

`centerClearance` é o controle mais útil para diagramação: ele define um **retângulo central reservado**, de 860×500 pixels em `0` até 1280×690 em `1`, onde nenhuma peça entra em nenhuma fase do ciclo. A conta acontece antes de qualquer termo de tempo, e o orçamento já inclui a órbita, a respiração e a silhueta desenhada de cada peça, medida por eixo — uma nuvem de 1,42 por 0,78 não é um círculo. Pelo mesmo motivo nenhuma peça é cortada pela borda do quadro. A zona é retangular de propósito, porque conteúdo é retangular: um vazio elíptico deixaria as quinas de um bloco de texto descobertas. Pedir um miolo maior encolhe a composição em vez de empurrar peça para fora da tela, então a promessa vale em todos os valores.

`familyCount` escolhe quantos grupos entram, sempre na ordem da tabela, e aumentar a contagem não reorganiza os grupos que já estavam. `familyScale` muda o tamanho geral. `drift` é a amplitude da flutuação: em `0` as peças ficam paradas no lugar, mas a respiração, o giro e o brilho continuam, então a cena nunca congela. `sparkleTrail` acrescenta de zero a quatro cintilos acompanhando o eixo de cada grupo, em cadência de razão áurea.

Com `transparent: true` e `outputFormat: "webm"`, o céu e o halo desaparecem, preservando nuvens, corações e estrelas com alpha. Os corpos são preenchidos com cor sólida e o brilho é pintado por cima, e o cintilo leva um núcleo branco, para que a cena continue legível tanto sobre vídeo claro quanto sobre vídeo escuro. Em MP4/GIF, todos os elementos são compostos sobre `backgroundColor`, que pode receber um tom escuro para uma versão noturna da mesma cena.

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

São quatro amostras de 0,4 segundo por composição: MP4, WebM opaco, WebM com alpha e GIF. O relatório em `out/validation/report.json` registra cada arquivo aprovado, incluindo a comparação do primeiro frame decodificado com um PNG novo do Remotion, composto sobre fundos claro e escuro. Para amostras mais longas, use `npm.cmd run validate:exports -- --duration 8`. Para retomar uma verificação interrompida sem repetir os encodes existentes, acrescente `--reuse-existing`: os arquivos presentes serão novamente inspecionados e os ausentes serão renderizados. Após alterar animações ou presets de exportação, execute sem essa opção para gerar arquivos novos.

Para validar uma mudança visual, reproduza pelo menos dois ciclos no Studio. Inspecione especialmente a emenda, as bordas, sombras, cores e a composição sobre fundos claros e escuros quando houver alpha. Durações e seeds diferentes devem manter o loop contínuo.

### Adicionar uma composição

1. Crie um componente em `src/backgrounds/` e estenda `baseBackgroundSchema` com controles Zod e valores iniciais.
2. Separe o cálculo visual em uma função pura que receba props, frame e total de frames. Use `loopPhase` e a seed para movimento periódico e reproduzível; evite relógio, `Math.random()`, animações CSS ou estado acumulado entre frames.
3. No componente, leia `useCurrentFrame()` e `useVideoConfig()`, desenhe o resultado da função e use a mesma regra de fundo das composições existentes.
4. Registre componente, schema e valores iniciais em `src/catalog.tsx` e adicione uma `Composition` em `src/Root.tsx`, seguindo os exemplos e compartilhando seus metadados. Use `id="Nome"` e um objeto literal em `defaultProps` para permitir salvar os controles no Studio. O exporter lê os defaults efetivos da composição e aplica apenas os overrides solicitados.
5. Inclua a nova cena nos testes de periodicidade/determinismo e acrescente um preset JSON de exemplo. Valide a emenda e renderize uma amostra nos formatos necessários.

`src/settings.ts` concentra a regra de alpha, os metadados e os presets. Mantenha os pacotes Remotion na mesma versão exata e preserve o lockfile para instalações reproduzíveis.
