# Background Creator

Backgrounds animados em **1920×1080** e overlays animados para packs de live — fundos de chat, blocos para texto e bordas para câmera e jogo —, feitos com Remotion, React e TypeScript. Ajuste os parâmetros no Studio ou por JSON e exporte um ciclo contínuo em WebM, MOV, MP4 ou GIF, ou um quadro parado em PNG, sem áudio. Os overlays nascem transparentes e saem no tamanho de cada produto; um único comando monta o pack inteiro de um tema.

## Começar

Use Node.js 22 ou superior e npm. No diretório do projeto:

```sh
npm ci
npm run studio
```

O primeiro render pode baixar o Chrome Headless Shell usado pelo Remotion. Para GIF e validação dos exports, instale também FFmpeg e FFprobe completos (a validação usa recursos que o FFmpeg embutido no Remotion não tem) e deixe os executáveis no `PATH`. Se necessário, defina `FFMPEG_PATH` e `FFPROBE_PATH` com os caminhos completos dos executáveis.

Escolha uma composição no Studio e edite as propriedades no painel lateral. As composições ficam em quatro pastas, uma por [tipo de asset](#tipos-de-asset): `backgrounds`, `chat`, `text-boxes` e `borders`. O preview respeita o formato selecionado: `webm`, `mov` e `png` permitem alpha, enquanto `mp4` e `gif` mostram o resultado sobre a cor de fundo.

Os fundos (pasta `backgrounds`) ocupam a tela inteira:

| Composição | Movimento | Controles específicos |
| --- | --- | --- |
| `WutheringWavesLoop` | Blue-and-gold waterside SVG/WebGL illustration with layered lotus, a curved boat, distant eaves and pine, and procedural paper/ink texture | `atmosphere` (mist), `resonance` (light and ribbon details), `particleCount` (particles), `motion` (movement), `centerShade` (central shading) |
| `HalloweenLoop` | Noite ilustrada com lua, morcegos, névoa e abóboras iluminadas | `batCount` (0–18), `emberCount` (0–120), `fogIntensity` (0–1), `moonScale` (0,5–1,5) |
| `HauntedMansionLoop` | Mansão vitoriana à direita, luar frio, janelas âmbar e névoa baixa | `batCount` (0–12), `moteCount` (0–100), `fogIntensity` (0–1), `windowIntensity` (0–1), `moonScale` (0,6–1,4) |
| `HauntedInteriorLoop` | Salão gótico em perspectiva central, com a parede do fundo atrás do conteúdo, janelas enluaradas, relâmpagos, cortinas de veludo, candelabros e lustre oscilante | `dustCount` (0–100), `fogIntensity` (0–1), `candleIntensity` (0–1), `moonlightIntensity` (0–1), `hauntingIntensity` (0–1), `chandelierSway` (0–1), `lightningIntensity` (0–1) |
| `CobwebLoop` | Teias de aranha nos cantos, com orvalho, fios de seda e aranha pendurada | `webCount` (0–4), `strandCount` (0–24), `moteCount` (0–120), `spiderCount` (0–3), `dewIntensity` (0–1), `mistIntensity` (0–1) |
| `ChristmasLoop` | Christmas frame on dark evergreen velvet: a gilded pine garland with a burgundy bow across the top, glass baubles swaying on ribbons, frosted pine with cones and holly in the corners, warm garland lights, bokeh and two depths of slow snow around a calm center | `baubleCount` (0–10), `snowCount` (0–240), `bokehCount` (0–48), `sparkleCount` (0–60), `sway` (0–1), `lightGlow` (0–1), `twinkle` (0–1), `centerCalm` (0–1) |
| `KawaiiLoop` | Nuvens, corações e estrelas pastel em grupos, com o miolo livre | `familyCount` (2–6), `familyScale` (0,7–1,4), `centerClearance` (0–1), `drift` (0–1), `sparkleTrail` (0–4) |
| `SunburstLoop` | Leque de raios que partem do centro, com gradiente do miolo para fora | `rayCount` (6–48), `rayWidth` (0,15–0,8), `swirl` (0–1), `spin` (−24–24, inteiro), `coreFade` (0–1), `coreShade` (0–1) |
| `VaporwaveLoop` | Horizonte neon com sol fatiado, grade rosa e ciano em perspectiva, montanhas aramadas, palmeiras e sólidos flutuando, com o miolo livre | `speed` (0–12, inteiro), `sunPosition` (0,1–0,9), `neonGlow` (0–1), `starCount` (0–200), `shootingStars` (0–3), `palmCount` (0–3), `shapeCount` (0–4), `centerShade` (0–1) |
| `DotGridLoop` | Pontos em grade ou em fileiras alternadas, rolando sem fim em uma de oito direções | `direction` (8 direções), `layout` (`aligned` ou `alternating`), `dotColor`, `dotSize` (1–96 px), `spacing` (16–240 px), `speed` (0–480 px/s) |
| `CheckerboardLoop` | Tabuleiro xadrez em dois tons, reto ou inclinado, rolando sem fim em uma de oito direções | `direction` (8 direções), `angle` (−45–45°), `squareColor`, `squareSize` (16–480 px), `speed` (0–960 px/s) |
| `WebGLLoop` | Experimentos em shader WebGL: aurora, lava, seda, fundo do mar (cáusticas), células, curvas de nível, nebulosa, a série pastel (onda, esfera, dobra neon, camadas, entardecer e eclipse), aquarela e gradiente em malha | `experiment` (15 experimentos), `speed` (0–3), `scale` (0,5–2), `intensity` (0–2), `centerFade` (0–1) |
| `GradientLoop` | Manchas de gradiente com movimento orgânico | `scale` (0,25–3), `intensity` (0–2) |
| `ParticleLoop` | Partículas em trajetórias periódicas | `count` (1–600), `size` (0,5–24), `distribution` (`uniform` ou `center`) |
| `GeometricLoop` | Formas geométricas com rotação e deslocamento | `count` (1–100), `scale` (0,15–3) |

Os overlays ficam nas outras três pastas, com uma composição paramétrica cada:

| Composição | Pasta | O que é |
| --- | --- | --- |
| `ChatLoop` | `chat` | Painel para o widget de chat (OBS, StreamElements, Streamlabs), com cabeçalho opcional para o título |
| `BlockLoop` | `text-boxes` | Painel para texto: etiquetas, faixas de nome, títulos de tela, cards, listas e painéis da Twitch |
| `BorderLoop` | `borders` | Moldura em volta de uma janela transparente (câmera, jogo) ou da tela inteira |

Os controles dos overlays estão em [Overlays: controles](#overlays-controles) e os estilos prontos em [Temas](#temas).

## Parâmetros e presets

Todos os fundos compartilham estes parâmetros; os overlays usam os mesmos, exceto `colors`, e começam com `transparent: true`. `HalloweenLoop`, `CobwebLoop` e `KawaiiLoop` começam com 12 segundos, `HauntedMansionLoop`, `HauntedInteriorLoop` e `VaporwaveLoop` com 16 e `SunburstLoop` com 10; essas sete composições têm paleta e cor de fundo próprias. `CobwebLoop`, `KawaiiLoop`, `HauntedMansionLoop`, `HauntedInteriorLoop`, `SunburstLoop` e `VaporwaveLoop` também trazem a própria seed no schema. `DotGridLoop` usa os 8 segundos e a seed padrão, tem cor de fundo própria e troca a paleta `colors` por uma cor única, `dotColor`. `CheckerboardLoop` também usa os 8 segundos e a seed padrão e tem cor de fundo própria; no lugar de `colors`, pinta os quadrados com `squareColor`, e `backgroundColor` forma as outras casas. `WebGLLoop` começa com 16 segundos, seed 7, paleta e cor de fundo próprias. As composições de gradiente, partículas e geometria usam os padrões abaixo:

| Parâmetro | Padrão | Uso |
| --- | --- | --- |
| `durationSeconds` | `8` | Duração positiva do ciclo; arredondada para um número inteiro de frames |
| `colors` | Ciano, índigo e rosa | Paleta de 2 a 6 cores |
| `seed` | `1` | Inteiro que determina a distribuição reproduzível dos elementos |
| `transparent` | `false` | Remove o fundo quando `outputFormat` é `webm`, `mov` ou `png` |
| `backgroundColor` | `#0B0F19` | Cor opaca em hexadecimal `#RRGGBB`, aplicada nos exports opacos |
| `outputFormat` | `webm` | Formato do preview, que também determina o FPS |

Um arquivo de parâmetros pode conter somente as opções que você quer alterar; as demais recebem seus valores iniciais. Os exemplos em `presets/` oferecem estas direções visuais:

- `wuthering-waves-azure-lotus.json`: Wuthering Waves-inspired waterside illustration in azure, cream, turquoise and gold, with a 16-second loop and MP4 output; awaiting visual review.
- `halloween-midnight.json`: noite em violeta escuro, lua cremosa, abóboras âmbar e centro livre para conteúdo.
- `halloween-haunted-mansion.json`: mansão vitoriana em azul-noite, luar pálido, janelas âmbar e área central esquerda escura para overlay.
- `halloween-haunted-interior.json`: salão gótico em perspectiva, cortinas de veludo carmim, luar esverdeado e velas âmbar nas laterais, com um grande arco escuro exatamente atrás da área de conteúdo.
- `halloween-cobweb.json`: teias enluaradas em seda prateada, orvalho brilhante e um calor âmbar no rodapé.
- `christmas-gilded-garland.json`: evergreen, burgundy and gold Christmas frame with a gilded garland, swaying glass baubles and slow snow around a dark, calm center, in a 20-second loop.
- `kawaii-constellation.json`: nuvens, corações e estrelas em grupos, sobre leite morno, em ritmo lento.
- `sunburst-crimson.json`: leque de vermelho sobre vermelho escuro, o contraste mais baixo da série.
- `sunburst-sand.json`: raios largos de areia sobre creme, em ritmo mais lento.
- `sunburst-ocean.json`: raios finos de azul sobre azul-noite, com o miolo mais fechado.
- `sunburst-moss.json`: verde musgo sobre verde escuro, no ciclo mais longo.
- `vaporwave-horizon.json`: horizonte neon para stream, com o sol na borda direita atrás das palmeiras e o centro escuro para títulos, câmera e jogo.
- `vaporwave-classic.json`: o cartão-postal vaporwave, com o sol meio posto no centro do horizonte, três palmeiras por lado, quatro sólidos e uma placa mais forte atrás do conteúdo.
- `vaporwave-alpha.json`: WebM transparente para sobrepor ao jogo, com uma palmeira por lado e nenhum sólido, para deixar os cantos livres para o HUD, montanhas translúcidas, a grade dissolvendo antes do horizonte e perto da borda de baixo, e o miolo limpo.
- `dots-classic.json`: grade de pontos lilás sobre azul-noite, rolando na diagonal para baixo e para a direita.
- `dots-alternating.json`: fileiras alternadas de pontos pêssego sobre creme, andando para a esquerda.
- `dots-alpha.json`: WebM transparente com pontos brancos translúcidos em fileiras alternadas, subindo devagar, para sobrepor a outros vídeos.
- `checkerboard-classic.json`: tabuleiro clássico em quase preto e creme, com casas de 120 px, rolando devagar na diagonal para baixo e para a direita.
- `checkerboard-diamonds.json`: tabuleiro girado a 45°, com losangos rosa sobre rosa-claro, andando para a direita.
- `checkerboard-tilted.json`: tabuleiro verde-escuro inclinado 15° no sentido anti-horário, deslizando ao longo das fileiras para a esquerda.
- `checkerboard-alpha.json`: WebM transparente com quadrados brancos translúcidos, subindo devagar, para sobrepor a outros vídeos.
- `webgl-aurora.json`: aurora verde e ciano com raios violeta e rosa sobre azul quase preto, em 24 s, com o centro meio apagado para a webcam ou o jogo.
- `webgl-lava.json`: lâmpada de lava quente, com cera âmbar e laranja embaixo subindo até magenta e violeta, sobre ameixa quase preto.
- `webgl-silk.json`: seda champanhe, rosa e ameixa sobre fundo quase preto, com o miolo suavizado para texto.
- `webgl-caustics.json`: fundo do mar em azul-petróleo, ciano e verde-água, com raios de sol claros descendo até o leito.
- `webgl-cells.json`: células em turquesa, azul, anil e violeta sobre azul-petróleo quase preto, com o centro suavizado para a câmera.
- `webgl-contours.json`: mapa topográfico em verde-azulado, sálvia, areia, laranja e terracota sobre grafite.
- `webgl-nebula.json`: nebulosa em azul-marinho, violeta, magenta, laranja e amarelo-claro, em 30 s de deriva lenta.
- `webgl-flow.json`: onda de fita pastel em pêssego, rosa e lilás sobre lavanda, com a crista luminosa, um brilho creme à esquerda e um véu azul-pervinca à direita.
- `webgl-orbital.json`: esfera perolada em azul, lilás, rosa e pêssego num estúdio lavanda, no terço direito do quadro, com as luzes dando uma volta a cada 24 s.
- `webgl-neon.json`: dobra de cetim em rosa, lavanda, azul-violeta e anil sobre orquídea pastel, com dois filetes neon e pulsos de luz deslizando pelo vinco.
- `webgl-layers.json`: camadas de vidro líquido em violeta, azul e água, com borda branca luminosa e halo lilás sobre azul-céu pastel.
- `webgl-haze.json`: entardecer pastel em coral, dourado, rosa, lilás, magenta e violeta sobre base rosada, com a linha dourada ondulando.
- `webgl-eclipse.json`: eclipse pastel com um disco azul-lavanda claro no alto à esquerda, faixas de pervinca a azul-centáureo e um aro lilás luminoso no canto.
- `webgl-watercolor.json`: aquarela em papel creme prensado a frio, com azul ultramar, rosa quinacridona, amarelo gamboge e verde viridian nos cantos e nas laterais, e o meio livre para título, câmera e jogo.
- `webgl-mesh.json`: gradiente em malha com as seis cores do original (coral, dourado, azul-céu, violeta, rosa e menta), cobrindo o quadro inteiro, em 24 s.
- `webgl-alpha.json`: WebM transparente com curvas de nível claras e translúcidas e o centro quase todo livre, para sobrepor ao jogo no OBS.
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

## Tipos de asset

Cada composição pertence a um tipo, definido em `src/kinds.ts`. O tipo decide a pasta no Studio, se o tamanho é fixo ou livre e o valor inicial de `transparent`. O formato inicial é `webm` em todos.

| Tipo | Pasta no Studio | Composições | Tamanho | `transparent` padrão |
| --- | --- | --- | --- | --- |
| `background` (fundos) | `backgrounds` | as 15 da primeira tabela | Fixo, 1920×1080 | `false` |
| `chat` (fundos de chat) | `chat` | `ChatLoop` | Livre; começa em `chat-standard` | `true` |
| `block` (blocos de texto) | `text-boxes` | `BlockLoop` | Livre; começa em `card` | `true` |
| `border` (bordas e molduras) | `borders` | `BorderLoop` | Livre; começa em `webcam-16x9` | `true` |

Os fundos não têm controles de tamanho. Nos outros três tipos, o tamanho segue um modelo único:

- **Caixa** (`width` × `height`): no chat e no bloco, o painel visível; na borda, a janela transparente por onde aparecem a câmera ou o jogo.
- **Bleed** (`bleed`): margem transparente igual nos quatro lados da caixa, onde cabem o brilho do contorno, o halo e, na borda, a própria moldura. O arquivo final mede **caixa + 2·bleed** em cada direção, com a caixa no centro: `chat-standard` tem caixa de 400×600 e bleed de 32, então o arquivo tem 464×664 e a caixa começa em (32, 32). Nada é desenhado além do bleed: se o brilho não cabe, o schema recusa e informa o menor bleed que serve (`The glow goes past the margin: use bleed ≥ N or reduce the glow.`). Com bleed 0, nada sai da caixa. O arquivo pode ter até 3840 px de lado e a área de 3840×2160.
- **Área de texto** (`content`): onde entram o texto do bloco ou as mensagens do chat. É a caixa menos o contorno, o padding, a barra de destaque do bloco e o cabeçalho do chat, afastada também da curva dos cantos arredondados, em pixels inteiros. No bloco redondo, é o quadrado centralizado no círculo cujos cantos ficam a (espessura do destaque + o maior entre `paddingX` e `paddingY`) px do lado de dentro do contorno, com lado par para ficar centrado em pixels inteiros: 72×72 em `circle-sm`, 186×186 em `circle` e 298×298 em `circle-lg`, no visual padrão. O chat com cabeçalho informa ainda `header`, a área do título. Nada decorativo fica forte sobre essas áreas: o brilho do contorno pode chegar a no máximo 20% de opacidade sobre elas, e o schema recusa o que passar disso, dizendo o que mudar.
- **Janela da borda** (`hole`): a região que fica com alpha 0 em todos os frames, qualquer que seja o parâmetro; o brilho é recortado dela. É um retângulo em pixels inteiros inscrito na janela arredondada; em `window`, a caixa inteira é a área da câmera (`content`).
- **Encaixe da borda** (`fit`): em `window` (padrão), a caixa é a janela e a moldura e o brilho vão para fora, no bleed. Os cantos da caixa que ficam fora da curva da janela são cobertos pela moldura, para arredondar uma câmera retangular posta exatamente na caixa; isso funciona até um raio de cerca de 2,4 vezes `thickness`, e acima disso (uma webcam redonda, como `webcam-round`) quem arredonda a câmera é a [máscara](#packs), e a faixa fica tão translúcida quanto o preenchimento pede em toda a volta. Em `screen`, a caixa é o arquivo inteiro (bleed 0, como em `fullscreen`), a moldura é desenhada da borda do arquivo para dentro e o brilho só vai para dentro; a janela é o que sobra no meio.
- **Medidas fixas em px**: raio, espessura, padding, traços, cometas e brilho não crescem com a caixa, como em CSS. Por isso a etiqueta de 320×64 e o título de 1200×240 de um mesmo tema têm o mesmo traço e o mesmo brilho. O raio é limitado à metade do menor lado: um raio grande vira pílula; numa caixa quadrada, vira o mesmo círculo de `shape: "circle"` (no bloco, texto no quadrado inscrito e destaque em arco), mas o arquivo mantém o nome do tamanho pedido. Para o produto redondo, use `shape` ou os tamanhos redondos.
- **Forma** (`shape`, bloco e borda): `rectangle` (padrão), com os cantos de `radius`, ou `circle`. O círculo exige caixa quadrada (senão o schema recusa: `A circle needs equal width and height (the box is 640×360): use --size circle-sm, circle or circle-lg, make width and height equal or use shape rectangle.`) e ignora `radius`: o raio é metade do lado. Contorno, brilho, halo, preenchimento, cometas e formigas seguem o círculo, que tem perímetro 2πr. A moldura de tela (`fit: "screen"`) não pode ser redonda, porque acompanha a tela.
- **Dimensões sempre pares**: `width`, `height` e `bleed` são inteiros pares, em todos os formatos. O H.264 exige lados pares e o Remotion corta 1 px de uma dimensão ímpar sem avisar; o schema recusa (`width must be even: H.264 silently crops 1 px off odd dimensions.`) em vez de entregar um arquivo menor que o pedido. Com caixa e bleed pares, as bordas retas da caixa caem em coordenadas pares, que o WebM, com a cor guardada em blocos de 2×2 px, reproduz sem franja colorida.

`guides: true` desenha no Studio a caixa, a área de texto e a janela, para conferir o encaixe; o export recusa esse modo com `Turn guides off to export.`

## Tamanhos

Os tamanhos do catálogo, em `src/sizes.ts`, são a linha de produtos: cada id vira o nome do arquivo. `npm run render:webm -- --list` mostra a mesma lista. Um tamanho define caixa e bleed e, quando o produto exige, outros parâmetros: as bordas de webcam e de jogo fixam `fit: "window"`, as molduras de tela fixam `fit: "screen"`, todo tamanho de bloco e de borda fixa a forma (`shape: "circle"` nos redondos, `shape: "rectangle"` nos outros) e o painel da Twitch zera `glow` e `halo`, porque não tem bleed. Esses valores prevalecem sobre o preset e o `--props`: `--size webcam-16x9` dá um retângulo mesmo sobre um JSON com `shape: "circle"`.

Fundos de chat (a caixa é o painel):

| Id | Caixa | Bleed | Arquivo final | Uso |
| --- | --- | --- | --- | --- |
| `chat-compact` | 360×480 | 32 | 424×544 | Canto da tela, layouts com câmera grande |
| `chat-standard` | 400×600 | 32 | 464×664 | Caixa de chat comum (OBS, StreamElements, Streamlabs) |
| `chat-tall` | 400×800 | 32 | 464×864 | Lateral alta ao lado do jogo |
| `chat-column` | 448×1016 | 32 | 512×1080 | Coluna de altura total; o arquivo tem exatamente a altura da tela |
| `chat-vertical` | 960×640 | 32 | 1024×704 | Lives verticais (tela 1080×1920), metade de baixo |

Blocos de texto (a caixa é o painel):

| Id | Caixa | Bleed | Arquivo final | Uso |
| --- | --- | --- | --- | --- |
| `label-sm` | 320×64 | 24 | 368×112 | Selo curto: "AO VIVO", @usuário |
| `label` | 480×96 | 24 | 528×144 | Rótulos: último seguidor, meta, redes |
| `lower-third` | 1200×160 | 32 | 1264×224 | Terço inferior: nome e título |
| `title` | 1200×240 | 32 | 1264×304 | Título das telas (Começando, Volto já, Encerrando) |
| `card` | 640×360 | 32 | 704×424 | Card 16:9: agenda, regras, patrocinador |
| `square` | 480×480 | 32 | 544×544 | QR code, avatar, destaque |
| `list` | 480×720 | 32 | 544×784 | Lista vertical: agenda da semana, top apoiadores |
| `circle-sm` | 160×160 | 24 | 208×208 | Selo pequeno redondo: ícone, rede social, "AO VIVO" |
| `circle` | 320×320 | 32 | 384×384 | Redondo: avatar, logo, contador |
| `circle-lg` | 480×480 | 32 | 544×544 | Redondo grande: destaque, sorteio, meta |
| `twitch-panel` | 320×160 | 0 | 320×160 | Painéis do perfil da Twitch (PNG/GIF, sem brilho externo) |

Bordas e molduras (a caixa é a janela transparente):

| Id | Caixa | Bleed | Arquivo final | Uso |
| --- | --- | --- | --- | --- |
| `webcam-16x9` | 640×360 | 48 | 736×456 | Câmera padrão |
| `webcam-16x9-lg` | 960×540 | 48 | 1056×636 | Câmera grande (Just Chatting) |
| `webcam-4x3` | 480×360 | 48 | 576×456 | Câmeras 4:3 |
| `webcam-square` | 400×400 | 48 | 496×496 | Câmera quadrada (para câmera redonda, use `webcam-round`) |
| `webcam-round-sm` | 280×280 | 48 | 376×376 | Câmera redonda pequena no canto |
| `webcam-round` | 400×400 | 48 | 496×496 | Câmera redonda padrão |
| `webcam-round-lg` | 560×560 | 48 | 656×656 | Câmera redonda grande para Just Chatting |
| `webcam-vertical` | 360×640 | 48 | 456×736 | Câmera 9:16 em lives verticais |
| `gameplay` | 1440×810 | 48 | 1536×906 | Captura do jogo em layouts com coluna lateral |
| `fullscreen` | 1920×1080 | 0 | 1920×1080 | Moldura da tela inteira (`fit: "screen"`) |
| `fullscreen-vertical` | 1080×1920 | 0 | 1080×1920 | Moldura da tela inteira vertical (`fit: "screen"`) |

Os tamanhos redondos (`circle*` e `webcam-round*`) desenham um círculo inscrito na caixa; a câmera redonda precisa da [máscara](#packs) no OBS para ficar redonda. `webcam-square` e `webcam-round` têm a mesma caixa, mas são produtos diferentes, com nomes de arquivo diferentes. Fora do catálogo, qualquer caixa par serve: use `--width`, `--height` e `--bleed` (ou os mesmos campos no JSON e no Studio); um círculo fora do catálogo leva a forma no nome (`BlockLoop-300x300-circle.webm`). Os presets de tema não fixam tamanho e funcionam em todos os tamanhos do seu tipo.

## Overlays: controles

Os três overlays compartilham o vocabulário abaixo, além de `durationSeconds`, `seed`, `transparent`, `backgroundColor`, `outputFormat`, `width`, `height`, `bleed`, `guides` e `radius` (0–1920 px). Todas as medidas são em pixels fixos. Os valores iniciais de cada composição formam o visual neon; os [temas](#temas) trazem os outros.

| Parâmetro | Faixa | Uso |
| --- | --- | --- |
| `fill` | `solid`, `gradient`, `dots`, `stripes`, `sparkles`, `glass`, `fog`, `damask` | Preenchimento do painel (ou da faixa da moldura): cor lisa, cores balançando devagar, grade de pontos rolando, listras diagonais rolando, cintilantes, vidro translúcido com um reflexo que passa (a faixa do reflexo tem 30% do lado menor da área, entre 24 e 480 px: acompanha o tamanho, como um reflexo de verdade), bancos de névoa macios rolando de lado pela parte de baixo, em duas fileiras com o mesmo passo e a mesma velocidade, ou papel de parede adamascado (o motivo do salão de `HauntedInteriorLoop`) em ladrilhos com meia-queda |
| `fillColors` | 1 a 3 cores | Com uma cor, só o padrão; com mais, a primeira é a base e as outras formam o padrão. Na `fog`, a segunda é a névoa e a terceira o miolo claro de cada banco; no `damask`, a segunda é a tinta e a terceira fica de fora |
| `fillOpacity` | 0–1 | Opacidade do preenchimento |
| `fillScale` | 8–256 px | Tamanho do padrão: distância entre pontos, largura de cada listra com o intervalo, espaço médio entre brilhos, altura de cada banco de névoa (5,8 vezes mais largo, um a cada 2,25 × `fillScale`), largura do ladrilho do damasco (1,5 vez mais alto) |
| `fillSpeed` | 0–480 px/s | Velocidade do padrão, a mesma em todo tamanho. Pontos, listras, damasco e o giro dos brilhos andam períodos inteiros por ciclo; o gradiente balança para lá e para cá; no vidro, o reflexo passa por cada ponto uma vez por ciclo. A névoa anda de lado períodos inteiros de 2,25 × `fillScale`: `fillSpeed` = k · 2,25 · `fillScale` / `durationSeconds`, com k inteiro, dá a velocidade exata em todo tamanho; use k ≥ 3: com menos voltas, as zonas mais densas e mais ralas da névoa ficam paradas no painel e os bancos só passam por elas. `0` deixa o padrão parado (o damasco vira papel de parede) |
| `fillAngle` | −180–180° | Direção do gradiente, das listras e do reflexo (0 = para a direita, 90 = para baixo); os pontos e o damasco seguem o eixo ou a diagonal mais próxima; a névoa só anda de lado, para a direita quando o ângulo aponta para a direita ou na vertical e para a esquerda nos outros casos |
| `fillRise` | `true`/`false` | Só em `sparkles`: sobem como brasas em vez de cintilar no lugar |
| `fillLight` | 0–1 | Véu branco no topo do preenchimento, sumindo até embaixo; dá volume ao vidro |
| `strokeMotion` | `still`, `pulse`, `dashes`, `comets`, `gradient` | Movimento do contorno: fixo, respirando, tracejado andando, cometas com cauda ou cores correndo pelo contorno |
| `strokeColors` | 1 a 4 cores | Cores do contorno, distribuídas ao longo dele |
| `strokeWidth` | 0–64 px | Espessura do contorno; 2 px ou mais evita perda de cor no WebM |
| `strokeSpeed` | 0–4000 px/s | Velocidade ao longo do contorno, arredondada para períodos inteiros por ciclo (veja [Como o loop funciona](#como-o-loop-funciona)) |
| `dashLength`, `gapLength` | 2–512 px | `dashes`: traço e espaço, ajustados juntos para fechar o contorno |
| `cometSpacing` | 32–4000 px | `comets`: distância entre um cometa e o seguinte; a quantidade sai do tamanho |
| `cometTail` | 8–4000 px | `comets`: comprimento da cauda, no máximo o espaço entre cometas |
| `gradientLength` | 32–4000 px | Comprimento em que as cores se repetem ao longo do contorno (`gradient`, e `still` ou `pulse` com várias cores) |
| `strokePulses` | 1–16 | `pulse`: quantas vezes o contorno respira por ciclo |
| `strokeCore` | 0–1 | Miolo claro no meio do traço, como num tubo de neon (traços de 2,5 px ou mais) |
| `trackOpacity` | 0–1 | `dashes` e `comets`: o contorno inteiro, apagado, por baixo deles, na primeira cor |
| `glow` | 0–128 px | Alcance do brilho do contorno; para fora da caixa, precisa caber no bleed; em 0, os enfeites (`ornaments`) ficam sem luz e o `cobweb` perde o luar, a brasa e a aranha |
| `glowPulses` | 0–16 | Quantas vezes o brilho pulsa por ciclo; 0 deixa constante |
| `glowStrength` | 0,25–3 | Multiplica a opacidade do brilho sem mudar o alcance |
| `halo`, `haloColor` | 0–128 px | Brilho em volta do painel ou da moldura inteira, dentro do bleed |
| `rimLight` | 0–1 | Reflexo de 1 px por dentro da borda de cima, sumindo pelas laterais, como numa placa de vidro; no círculo, acende só o arco de cima, mais forte no topo e sumindo até a metade da altura |
| `ornaments` | `none`, `midnight`, `haunted-mansion`, `haunted-interior`, `cobweb` (`none`) | Enfeites temáticos em volta do painel ou da moldura, tirados dos fundos de Halloween (veja [Enfeites](#enfeites)); `none` não desenha nada |
| `ornamentColors` | 1 a 3 cores (`#CFC6E4`, `#F6EFD8`, `#E8963C`) | Como `colors` nos fundos: a primeira é a névoa ou a seda (fria), a segunda o luar (bordas claras e brilhos) e a terceira a luz quente (velas, abóboras, vidro das lanternas, brasa); sem a terceira, a luz quente usa a primeira |
| `ornamentSize` | 12–256 px (`48`) | Tamanho do motivo principal, em px fixos que não acompanham a caixa: diâmetro da lua (no `midnight`, a lua não é desenhada, mas marca o canto dos morcegos), altura da lanterna, altura do candelabro até a ponta da chama ou raio da teia. O par do principal (a outra lanterna, os outros candelabros, as outras teias, o luar e a brasa do `cobweb`) e a rosácea guardam proporções fixas a ele; morcegos, abóboras, grade, arandelas e portão crescem com ele só até um teto (cerca de 40, 48, 30, 44 e 36 px), e estrelas, brasas do `midnight`, lancetas e guirlandas têm tamanho fixo. Cada um fica limitado ao espaço livre do seu lugar |
| `ornamentScale` | 1–4 (`1`) | Escala de todos os enfeites juntos, para molduras grandes: tamanhos, tetos, traços e espaçamentos crescem na mesma proporção, como se a caixa fosse `1/ornamentScale` do tamanho e o desenho fosse ampliado. O espaço livre também é medido nessa escala, então enfeites maiores pedem bleed (ou padding, ou faixa) proporcionalmente maior: com `ornamentScale: 2`, o bleed de 48 px rende o que 24 px rendem na escala 1. Em `1`, nada muda |
| `lightning` | 0–1 (`0`) | Clarão frio de relâmpago sobre o painel ou a faixa da moldura, com um fio de luz no contorno, independente de `ornaments`. Segue `HauntedInteriorLoop` com a mesma `seed` e o mesmo `durationSeconds`: os mesmos instantes, com os lados esquerdo e direito clareando como as duas janelas do salão. No pico, o véu chega a 0,16 × `lightning` no painel e a 0,35 × `lightning` na faixa. Abaixo de 1,5 s de ciclo não há relâmpagos, e `lightning` acima de 0 é recusado |

A névoa tem um teto de legibilidade: o corpo cobre no máximo 0,30 e o miolo 0,10, então, no kit da mansão, texto creme fica em ≥ 6,9:1 e âmbar em ≥ 4,9:1 com `fillOpacity` 1 ou sobre imagem escura. Abaixo de 1, a imagem aparece pela base: com `fillOpacity` 0,9 sobre imagem branca, o âmbar cai para 4,3:1; use `fillOpacity` ≥ 0,95 para manter ≥ 4,7:1. O damasco tem o mesmo alfa (`fillOpacity`) na tinta e no fundo.

`ChatLoop` (padrão `chat-standard`, 8 s):

| Parâmetro | Faixa | Uso |
| --- | --- | --- |
| `padding` | 0–512 px (`16`) | Espaço entre o contorno e as mensagens |
| `headerHeight` | 0–512 px, inteiro (`48`) | Altura do cabeçalho no topo, onde vai o título ("CHAT"); `0` remove o cabeçalho |
| `headerColor`, `headerOpacity` | cor; 0–1 (`0.1`) | Cor e opacidade da faixa do cabeçalho; opacidade `0` deixa só a linha |
| `headerLineWidth` | 0–16 px (`2`) | Linha entre o cabeçalho e as mensagens, nas cores do contorno; `0` remove |

`BlockLoop` (padrão `card`, 8 s):

| Parâmetro | Faixa | Uso |
| --- | --- | --- |
| `shape` | `rectangle`, `circle` | Forma do bloco; `circle` exige caixa quadrada (`circle-sm`, `circle`, `circle-lg`) e ignora `radius` |
| `paddingX`, `paddingY` | 0–512 px (`24`, `16`) | Espaço horizontal e vertical entre o contorno (ou a barra de destaque) e o texto; no círculo vale o maior dos dois, em toda a volta |
| `accent` | `none`, `left`, `top` | Barra de destaque por dentro do contorno; o texto começa depois dela. No círculo, é um arco de 120° colado por dentro do contorno, centrado à esquerda ou no topo, e o quadrado do texto encolhe a espessura dele em toda a volta, para continuar centralizado |
| `accentColor`, `accentSize` | cor; 2–64 px (`6`) | Cor e espessura da barra (ou do arco) |
| `accentSheen` | 0–4 | Quantas vezes um reflexo percorre a barra por ciclo; `0` desliga. No círculo, o reflexo dá voltas inteiras pelo meio do arco e só aparece enquanto passa por ele |

`BorderLoop` (padrão `webcam-16x9`, 8 s). Aqui `radius` é o raio da janela, o preenchimento pinta a faixa da moldura e `strokeWidth` não pode passar de `thickness`:

| Parâmetro | Faixa | Uso |
| --- | --- | --- |
| `fit` | `window`, `screen` | Veja [Tipos de asset](#tipos-de-asset); `screen` exige bleed 0 |
| `shape` | `rectangle`, `circle` | Forma da janela; `circle` é a câmera redonda (`webcam-round-sm`, `webcam-round`, `webcam-round-lg`), exige caixa quadrada e `fit: "window"` e ignora `radius` |
| `thickness` | 2–256 px (`10`) | Espessura da faixa da moldura; o contorno corre no meio dela |
| `lines` | 1–2 (`2`) | `2` acrescenta uma linha fina por fora da faixa, parada em `dashes` e `comets` |
| `lineGap`, `outerLineWidth` | 1–64 px (`4`); 1–32 px (`2`) | Espaço até a segunda linha e a espessura dela |
| `corners` | `none`, `brackets`, `jewels` | Adorno dos cantos (outra coisa que os [enfeites](#enfeites) de `ornaments`; os kits usam `none`): cantoneiras em volta da moldura ou losangos sobre a faixa. No círculo, os colchetes são quatro arcos por fora da moldura, centrados nas diagonais, e as joias ficam sobre o anel nas diagonais, sem tocar a janela |
| `cornerSize`, `cornerGap` | 4–512 px (`28`); 0–128 px (`6`) | `brackets`: comprimento de cada braço depois da curva e distância da moldura (em `screen`, para dentro). No círculo, que não tem canto, cada colchete é um arco de 4×`cornerSize` px (112 px no padrão), igual em todos os tamanhos redondos e limitado a 70% de um quarto de volta |
| `gemSize` | 4–128 px (`14`) | `jewels`: largura de cada losango |
| `cornerPulses` | 0–16 (`1`) | Quantas vezes os cantos pulsam por ciclo, acendendo um depois do outro |
| `mask` | `true`/`false` | Exporta só a máscara da janela, em PNG, para o OBS (veja [Packs](#packs)) |

Os overlays não trazem texto: o texto, a câmera e as mensagens entram por cima, no programa de live ou no editor, nas áreas que o [JSON de posição](#exportar) informa.

### Enfeites

Os enfeites (`ornaments`) ficam no bleed, nos bolsões do padding e sobre a faixa da moldura, nunca sobre a área de texto nem na janela, e o que sai da caixa cabe no bleed. Cada motivo tem tamanho fixo em px, limitado ao espaço livre do seu lugar, como o `radius` é limitado à metade do lado; o posicionamento depende só da geometria (tamanho, bleed, padding, radius, faixa, brilho, cabeçalho do chat e, nos blocos redondos, a barra de destaque), de `ornaments` e de `ornamentSize`, nunca do frame nem da seed. Um motivo secundário que não cabe no seu mínimo fica de fora, e a quantidade de motivos é fixa para cada preset e tamanho. Se nem o principal couber, o schema recusa com a saída: `The "cobweb" ornaments do not fit this size: increase bleed, padding or radius or use ornaments none.` A saída muda com o tipo: no chat, `bleed`, `padding` e `radius` (em pílula, sem `radius`); nos blocos, `bleed`, `paddingX`, `paddingY` e `radius` (sem `radius` quando ele já está no máximo: círculo ou pílula); nas bordas de janela, `bleed` e `radius` (na câmera redonda ou em pílula, só `bleed`); nas molduras de tela, `thickness`, `glow` ou `radius` (sem `radius` quando a janela já é redonda). Os motivos se mexem em ciclos inteiros, com a velocidade contínua na emenda, e o frame 0, que é o do PNG, mostra a pose principal: asas abertas, chamas e vidros acesos, orvalho à vista.

| Conjunto | Motivos | `ornamentSize` | Onde ficam |
| --- | --- | --- | --- |
| `midnight` | Morcegos batendo as asas, abóboras com o rosto aceso, estrelas de quatro pontas e brasas | Diâmetro da lua (não desenhada) | A lua não aparece: ela só reserva o canto superior direito, e a combinação é recusada se nem ela couber. Até três morcegos (conforme o espaço) voam no bleed de cima, junto desse canto, e caixas com 900 px ou mais ganham um segundo bando. Há um par de abóboras embaixo à esquerda e uma à direita. Estrelas seguem o contorno livre a cada 168 px, e a borda de baixo das caixas largas alterna brasas e estrelinhas |
| `haunted-mansion` | Lanternas de ferro com vidro âmbar tremulando (a principal), grade de lanças, rosácea e lancetas, arandelas e portão | Altura da lanterna, do gancho à base | Duas lanternas pendem de suportes nos cantos de cima (nas telas e no painel da Twitch, direto do canto, sem suporte), e a grade sai dos cantos de baixo para o meio. Nas etiquetas, uma lanterna só, à direita, e a grade só à esquerda; nos tamanhos redondos não há grade. Contornos com 560 px ou mais ganham uma rosácea no meio do topo, com lancetas a cada 320 px; bordas com 900 px ou mais (`gameplay`, `webcam-16x9-lg`, telas), arandelas nas laterais; contornos com 1000 px ou mais, um portão no meio de baixo |
| `haunted-interior` | Candelabros de latão com velas acesas (o de três velas é o principal), arandelas de duas velas numa placa, sanefas de veludo com borlas e o clarão frio dos relâmpagos nas peças | Altura do candelabro, da base à ponta da chama mais alta | Um candelabro de três velas fica no canto superior direito e um de duas no esquerdo (nas etiquetas, só o de duas, à direita; nas telas, os candelabros de três velas ficam de pé nos cantos de baixo, os de duas nos de cima, e arandelas acompanham as faixas laterais). `gameplay` e `webcam-16x9-lg` ganham candelabros de pé no meio do topo e arandelas nas laterais. Sanefas de veludo pendem da borda de baixo de faixas, títulos, `gameplay` e `webcam-16x9-lg`, e da faixa de cima das telas |
| `cobweb` | Teias com orvalho que faísca quando a faixa de luar passa (a principal), luar, brasa âmbar, uma viúva-negra e guirlandas de fios caídos com gotas | Raio da teia principal, do miolo ao anel | A teia principal fica no canto superior direito, com o luar atrás, e outra no inferior esquerdo, com a brasa; nas bordas, os outros dois cantos também têm teia. As guirlandas pendem entre as teias ao longo da borda de cima e, nas bordas de janela retangulares e nos blocos retangulares maiores, ao longo da de baixo; os tamanhos redondos não têm guirlandas. A aranha (só com `glow` acima de 0) pende da teia principal pelo fio ao lado do chat, dos blocos e das câmeras `webcam-round-sm` e `webcam-round`; nas outras bordas e nas telas, fica pousada na teia principal, no bolso do canto, com a cabeça para o miolo |

Todos os motivos ficam na frente do painel ou da moldura. Nos tamanhos redondos, os cantos são os pontos do círculo a 45°: os morcegos do `midnight`, as lanternas (com suportes que saem do arco), os candelabros (com a roseta sobre o anel) e as teias ficam nas diagonais, e nos blocos redondos com `accent` os motivos da frente evitam o arco da barra. Com `glow: 0`, em qualquer tamanho, os enfeites ficam sem luz (abóboras, lanternas e velas sem o brilho em volta) e o `cobweb` fica sem luar, brasa e aranha. O painel da Twitch, que zera `glow` porque não tem bleed, fica sempre assim, com os motivos nos bolsões do padding. O `midnight` põe ali abóboras (com o padding do pack, também um morcego); o `haunted-mansion`, duas lanternas penduradas, sem grade; o `haunted-interior`, uma vela de castiçal no canto de baixo à direita; e o `cobweb`, a teia principal e a menor, sem aranha. Nas molduras de tela (bleed 0), os motivos ficam na frente, sobre a faixa, e podem avançar sobre a margem de brilho da faixa, no máximo `glow` px sobre a borda da imagem.

## Temas

Oito temas vestem os três tipos com a mesma família visual, um preset por tipo em `presets/<tipo>-<tema>.json`, e cada tema tem um pack com os fundos que combinam com ele. Os quatro kits de Halloween (`halloween-midnight`, `halloween-haunted-mansion`, `halloween-haunted-interior` e `halloween-cobweb`) acompanham um fundo cada, com a duração e a seed dele, e trazem os [enfeites](#enfeites) do mesmo cenário:

| Tema | Visual | Presets | Fundos do pack |
| --- | --- | --- | --- |
| `neon` | Painel índigo translúcido com gradiente lento, cometas ciano e magenta num tubo de miolo branco, brilho forte e halo violeta; o bloco tem barra magenta à esquerda com reflexo, e a borda, faixa índigo lisa, linha dupla e colchetes pulsando. Ciclos de 8 s | `chat-neon`, `block-neon`, `border-neon` | `VaporwaveLoop` (`vaporwave-classic`) |
| `pastel` | Creme com pontos rosados rolando devagar, contorno rosa, menta e pêssego (tracejado no chat e na borda, respirando no bloco), cantos bem arredondados; o bloco tem barra menta no topo, e a borda, brilhos e joias. Ciclos de 12 s (borda, 10 s) | `chat-pastel`, `block-pastel`, `border-pastel` | `KawaiiLoop` (`kawaii-constellation`) |
| `glass` | Vidro branco a 10% com reflexo passando, luz de cima e filete de luz na borda superior, contorno fino em gradiente branco e lavanda, halo escuro discreto que destaca o painel sobre fundos claros; borda de linha única, sem cantoneiras nem joias. Ciclos de 8 a 10 s | `chat-glass`, `block-glass`, `border-glass` | `GradientLoop` (`gradient-aurora`) |
| `halloween` | Roxo profundo com brasas laranja e amarelas subindo, contorno laranja e roxo respirando duas vezes por ciclo, brilho pulsando e halo laranja; o bloco tem barra laranja à esquerda, e a borda, joias pulsando. Ciclos de 12 s | `chat-halloween`, `block-halloween`, `border-halloween` | `HalloweenLoop`, `HauntedMansionLoop` e `CobwebLoop` (presets `halloween-midnight`, `halloween-haunted-mansion`, `halloween-cobweb`) |
| `halloween-midnight` | Céu estrelado: brilhos creme e lavanda cintilando no lugar sobre roxo-noite, contorno em gradiente lavanda e creme correndo devagar, com miolo claro, e halo lavanda; o bloco tem barra lavanda no topo com reflexo, e a borda, faixa estrelada com linha dupla, sem cantoneiras nem joias (`corners: "none"`). Enfeites `midnight`: morcegos, abóboras, estrelas e brasas (o laranja do kit fica só nas abóboras e no brilho das brasas). Ciclos de 12 s, seed 31 | `chat-halloween-midnight`, `block-halloween-midnight`, `border-halloween-midnight` | `HalloweenLoop` (`halloween-midnight`) |
| `halloween-haunted-mansion` | Bancos de névoa fria rolando pela parte de baixo do chat (parados nos blocos, por causa do GIF do painel), contorno em gradiente de ferro, luar e âmbar, halo escuro e cabeçalho verde-acinzentado; a borda tem faixa lisa de ferro azulado e linha dupla. Enfeites `haunted-mansion`: lanternas de ferro, grade de lanças, rosácea, lancetas, arandelas e portão. Ciclos de 16 s, seed 81 | `chat-halloween-haunted-mansion`, `block-halloween-haunted-mansion`, `border-halloween-haunted-mansion` | `HauntedMansionLoop` (`halloween-haunted-mansion`) |
| `halloween-haunted-interior` | Damasco verde-escuro parado, contorno em gradiente de latão, halo de luz de vela e cabeçalho de veludo bordô (no bloco, barra bordô à esquerda); a borda tem faixa verde lisa e linha dupla. Enfeites `haunted-interior`: candelabros com velas, arandelas e sanefas de veludo, e o clarão dos relâmpagos (`lightning` 0,8 no chat e nos blocos, 1 na borda) junto com o fundo. Ciclos de 16 s, seed 113 | `chat-halloween-haunted-interior`, `block-halloween-haunted-interior`, `border-halloween-haunted-interior` | `HauntedInteriorLoop` (`halloween-haunted-interior`) |
| `halloween-cobweb` | Gradiente violeta-escuro balançando devagar, contorno prateado apagado com cometas creme passando como reflexos na seda, halo prateado e cantos arredondados; a borda tem faixa escura, linha dupla e raio 38. Enfeites `cobweb`: teias com orvalho, guirlandas de fios, luar, brasa âmbar e uma viúva-negra; o âmbar só aparece na ampulheta e na brasa. Ciclos de 12 s, seed 47 | `chat-halloween-cobweb`, `block-halloween-cobweb`, `border-halloween-cobweb` | `CobwebLoop` (`halloween-cobweb`) |

## Formatos

| Formato | Perfil oficial | Alpha | Onde usar |
| --- | --- | --- | --- |
| WebM | VP9, 60 fps, CRF 0, `yuv420p` ou `yuva420p` | Preservado quando solicitado | OBS (fonte de mídia e de navegador), StreamElements, Streamlabs, Chrome, Firefox e Edge. O Safari não mostra o alpha do VP9 |
| MOV | ProRes 4444, 60 fps, `yuv444p10le` ou `yuva444p10le` | Preservado quando solicitado | Premiere, After Effects, DaVinci Resolve e Final Cut |
| PNG | Um quadro RGBA (`--frame`, padrão 0) | Preservado quando solicitado | Versão parada do overlay, painéis da Twitch, editores de imagem |
| MP4 | H.264, 60 fps, CRF 1, `yuv420p`, preset `veryslow` | Composto sobre `backgroundColor` | Qualquer player e rede social |
| GIF | 50 fps, paleta global de até 256 cores, dithering `sierra2_4a`, loop infinito | Composto sobre `backgroundColor` | Painéis da Twitch e lugares que só aceitam imagem |

A regra de alpha é uma só no preview e no export: `transparent: true` só remove o fundo em WebM, MOV e PNG. MP4 não tem canal alpha, e o GIF só tem transparência de 1 bit, ligada ou desligada, que serrilharia brilhos e bordas suaves; por isso os dois são sempre compostos sobre `backgroundColor`. Com `transparent: true` num desses formatos, o terminal avisa `Transparency composited over <color>.` O que as seções dos fundos dizem sobre o WebM transparente vale igualmente para MOV e PNG.

O MOV em ProRes 4444 é para edição, não para live: guarda a cor completa e um alpha de 10 bits, e o arquivo é enorme. Um segundo de `label` (528×144) tem cerca de 5,9 MB, e um MOV de 8 s em tela cheia fica na casa de 1 GB. Para comparar, um segundo de WebM numa borda de webcam tem cerca de 1,4 MB. O render de MOV desliga a aceleração de hardware, porque o codificador do sistema não grava ProRes com alpha.

## Exportar

Use os comandos oficiais para aplicar os presets de qualidade:

```sh
npm run render:mp4 -- HalloweenLoop --props presets/halloween-midnight.json
npm run render:mp4 -- HauntedMansionLoop --props presets/halloween-haunted-mansion.json
npm run render:mp4 -- HauntedInteriorLoop --props presets/halloween-haunted-interior.json
npm run render:webm -- CobwebLoop --props presets/halloween-cobweb.json
npm run render:webm -- KawaiiLoop --props presets/kawaii-constellation.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-crimson.json
npm run render:mp4 -- SunburstLoop --props presets/sunburst-sand.json
npm run render:webm -- SunburstLoop --props presets/sunburst-ocean.json
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-horizon.json
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-classic.json
npm run render:webm -- VaporwaveLoop --props presets/vaporwave-alpha.json
npm run render:mp4 -- DotGridLoop --props presets/dots-classic.json
npm run render:mp4 -- DotGridLoop --props presets/dots-alternating.json
npm run render:webm -- DotGridLoop --props presets/dots-alpha.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-classic.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-diamonds.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-tilted.json
npm run render:webm -- CheckerboardLoop --props presets/checkerboard-alpha.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-aurora.json
npm run render:webm -- WebGLLoop --props presets/webgl-alpha.json
npm run render:mp4 -- GradientLoop --props presets/gradient-aurora.json
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json
npm run render:gif -- GeometricLoop --props presets/geometric-orbit.json
```

Você pode escolher destino, duração e seed:

```sh
npm run render:webm -- ParticleLoop --props presets/particles-alpha.json --duration 12 --seed 2026 --out out/particles-12s.webm
```

Os overlays usam os mesmos comandos, com o tamanho em `--size` (os ids de [Tamanhos](#tamanhos)) ou em `--width`, `--height` e `--bleed`, em pixels pares. `render:mov` gera ProRes 4444 para editores de vídeo e `render:png` gera um quadro parado, o frame 0 ou o de `--frame`:

```sh
npm run render:webm -- ChatLoop --props presets/chat-neon.json --size chat-standard
npm run render:mov -- BlockLoop --props presets/block-glass.json --size lower-third
npm run render:gif -- BlockLoop --props presets/block-halloween.json --size twitch-panel
npm run render:webm -- BorderLoop --props presets/border-halloween-cobweb.json --size webcam-round
npm run render:png -- BorderLoop --props presets/border-pastel.json --size webcam-square --frame 120
npm run render:webm -- BlockLoop --props presets/block-neon.json --width 800 --height 120 --bleed 32
npm run render:webm -- --list
```

`--list` mostra as composições de cada tipo e os tamanhos do catálogo, com a caixa, o arquivo final e o uso; `--help` mostra todas as opções. Um tamanho de outro tipo é recusado com as opções válidas (`Size card is for text boxes, not chat backgrounds. Options: …`), e os fundos recusam `--size`, `--width`, `--height` e `--bleed`, porque têm tamanho fixo. `--frame` vale só com PNG e precisa estar dentro do ciclo, de 0 a N−1.

O formato do comando substitui `outputFormat` do JSON; `--duration` e `--seed` substituem os respectivos valores. A ordem de precedência é: JSON de `--props`, depois o tamanho de `--size`, depois `--width`, `--height` e `--bleed`. Sem `--out`, o destino segue o tipo:

- Fundos: `out/<Composição>.<formato>`, por exemplo `out/VaporwaveLoop.webm`.
- Overlays num tamanho do catálogo: `out/<Composição>-<tamanho>.<formato>`, por exemplo `out/ChatLoop-chat-standard.webm`. Vale quando caixa, bleed, encaixe e forma coincidem exatamente com o tamanho (a mesma caixa 400×400 dá `webcam-square` ou `webcam-round`, conforme `shape`).
- Overlays em tamanho livre: `out/<Composição>-<L>x<A>.<formato>`, com a largura e a altura da caixa, não do arquivo: `out/BlockLoop-800x120.webm`; num círculo fora do catálogo, a forma entra no nome: `out/BlockLoop-300x300-circle.webm`.

Arquivos existentes são preservados; acrescente `--overwrite` para substituí-los intencionalmente. O terminal informa as dimensões do arquivo, o número de frames e a duração efetiva antes do render. Nos overlays, informa também a velocidade real do movimento, que pode diferir um pouco da pedida porque o ciclo precisa fechar em períodos inteiros (veja [Como o loop funciona](#como-o-loop-funciona)):

```text
ChatLoop: 464×664, 60 fps, 480 frames (8.000 s).
Velocidade real: contorno 163.6 px/s, preenchimento 16 px/s (arredondadas para períodos inteiros por ciclo).
```

Cada overlay exportado ganha, ao lado, um JSON de posição com o mesmo nome e `.json` no fim (`out/ChatLoop-chat-standard.webm.json`). Ele diz onde fica cada coisa dentro do arquivo, em pixels a partir do canto superior esquerdo, para posicionar o texto, o widget de chat ou a câmera sem medir na tela:

```json
{
  "file": "ChatLoop-chat-standard.webm",
  "kind": "chat",
  "size": "chat-standard",
  "canvas": {"width": 464, "height": 664},
  "box": {"x": 32, "y": 32, "width": 400, "height": 600},
  "content": {"x": 51, "y": 101, "width": 362, "height": 512},
  "hole": null,
  "header": {"x": 51, "y": 47, "width": 362, "height": 24},
  "bleed": 32,
  "fps": 60,
  "frames": 480,
  "format": "webm",
  "alpha": true,
  "motion": {"strokeSpeed": 163.6, "fillSpeed": 16}
}
```

`canvas` é o arquivo; `box`, a caixa; `content`, a área das mensagens ou do texto; `header`, a área do título do chat; e `hole`, na borda, a janela que fica transparente em todos os frames. Com esse arquivo em (X, Y) na cena do OBS, em escala 100%, o widget de chat vai em (X + 51, Y + 101), com 362×512. O JSON registra ainda `bleed`, FPS, frames, o frame do PNG (`frame`), o formato, se há alpha, a velocidade real (`motion`) e, em `props`, todos os parâmetros usados. O comando avulso não gera a máscara da janela das bordas nem a cita no JSON: o pack a gera e a aponta no `manifest.json` (veja em [Packs](#packs) como gerá-la fora dele). Os fundos ocupam a tela inteira e não têm esse JSON.

`guides: true` só serve para o Studio: o export recusa com `Turn guides off to export.`, para que nenhum arquivo saia com as linhas de conferência.

No PowerShell, se o wrapper `npm.ps1` interpretar as opções como argumentos do npm, use `npm.cmd` nos mesmos comandos (por exemplo, `npm.cmd run render:mp4 -- GradientLoop --duration 8`).

Os perfis de cada formato estão em [Formatos](#formatos). Os fundos saem sempre em 1920×1080; chat, blocos e bordas saem no tamanho do arquivo (caixa + 2·bleed). Nenhum formato reduz resolução, FPS ou qualidade, e os vídeos usam intermediários PNG. GIF é produzido pelo FFmpeg em duas etapas: análise da sequência inteira para criar a paleta, seguida da aplicação da paleta com dithering. A cadência de 50 fps usa atrasos regulares de 20 ms.

Esses perfis priorizam qualidade e podem resultar em renders demorados e arquivos grandes. GIF tem limitações de cor e não preserva transparência parcial. MP4 não contém canal alpha. A exibição de alpha em WebM depende do reprodutor; um fundo preto em um player não prova ausência de alpha. O comando de validação decodifica com `libvpx-vp9` para verificar esse canal.

O diálogo de exportação manual do Studio permite configurações diferentes. Use os comandos acima para garantir os presets oficiais. Salve as alterações dos controles em **Save default props** para que os comandos também as utilizem, ou copie os valores para um JSON passado a `--props`. Alterações ainda não salvas ficam apenas no preview. O formato do comando e as opções explícitas do JSON/CLI prevalecem sobre os defaults salvos.

## Packs

Um pack é o conjunto de um tema, vendido como um zip (veja [Delivery](#delivery)): os fundos que combinam com ele, o chat nos cinco tamanhos, os blocos nos onze (os três redondos incluídos; o painel da Twitch em GIF e PNG) e as bordas nos onze (as três câmeras redondas incluídas), cada arquivo em WebM (o loop) e PNG (a versão parada), mais as máscaras das nove janelas das bordas. Os packs `neon`, `pastel` e `glass` têm 65 arquivos cada; o `halloween`, com três fundos, tem 69; os quatro kits de Halloween, com a versão sem enfeites, têm 115. Cada pack é descrito por um manifesto em `packs/<tema>.json`; há um para cada um dos oito [temas](#temas): `neon`, `pastel`, `glass`, `halloween` e os kits:

| Pack | Fundo | Props dos itens |
| --- | --- | --- |
| `halloween-midnight` | `HalloweenLoop` (`halloween-midnight`) | painel `{"paddingX": 48, "paddingY": 36}`; `gameplay` e `webcam-16x9-lg` ampliados |
| `halloween-haunted-mansion` | `HauntedMansionLoop` (`halloween-haunted-mansion`) | painel `{"paddingX": 32, "paddingY": 24}`; `gameplay` e `webcam-16x9-lg` ampliados |
| `halloween-haunted-interior` | `HauntedInteriorLoop` (`halloween-haunted-interior`) | `gameplay` e `webcam-16x9-lg` ampliados |
| `halloween-cobweb` | `CobwebLoop` (`halloween-cobweb`) | `gameplay` e `webcam-16x9-lg` ampliados |

Cada kit sai em duas versões. **Com enfeites:** o fundo, o chat nos cinco tamanhos, os blocos nos dez tamanhos e o painel da Twitch à parte, e as bordas das oito câmeras e do `gameplay`; as molduras de tela ficam de fora, porque ali os enfeites só cresceriam engrossando a faixa sobre a tela. **Sem enfeites:** todos os tamanhos de chat, blocos, painel e bordas, as duas telas incluídas, com o preset e `"ornaments": "none"`, nos arquivos `<pack>-<tamanho>-plain.<ext>`. As máscaras das câmeras valem para as duas versões e seguem o `radius` do preset.

Nas molduras grandes, enfeites em px fixos ficariam miúdos. Por isso o `gameplay` sai com `{"bleed": 96, "ornamentScale": 2}` e a `webcam-16x9-lg` com `{"bleed": 72, "ornamentScale": 1.5}`: os enfeites ficam na mesma proporção da `webcam-16x9`, e o arquivo ganha a margem que eles pedem (1632×1002 e 1104×684; a janela continua 1440×810 e 960×540). Deixe essa margem livre em volta da moldura na cena. No painel da Twitch do `midnight` e do `haunted-mansion`, mais padding faz os enfeites crescerem nos bolsões (no `midnight`, entram um morcego e a abóbora pequena; no `haunted-mansion`, as lanternas passam de 22 para 32 px).

Um manifesto de exemplo, menor que os de `packs/` (que pedem todos os tamanhos):

```json
{
  "name": "neon-exemplo",
  "items": [
    {"composition": "VaporwaveLoop", "preset": "vaporwave-classic", "formats": ["webm", "png"]},
    {"composition": "ChatLoop", "preset": "chat-neon", "sizes": ["chat-standard", "chat-tall"], "formats": ["webm", "png"]},
    {"composition": "BlockLoop", "preset": "block-neon", "sizes": ["twitch-panel"], "formats": ["gif", "png"]},
    {"composition": "BorderLoop", "preset": "border-neon", "sizes": ["webcam-round"], "formats": ["webm", "png"], "frame": 120}
  ]
}
```

`name` vira o nome da pasta e o começo do nome de cada arquivo (letras minúsculas e números, em palavras ligadas por um hífen só, sem hífen nas pontas). Cada item exporta uma composição com um preset de `presets/` (sem a pasta e sem `.json`), `props` opcionais por cima dele, os `sizes` do catálogo (só para chat, blocos e bordas; um fundo com `sizes` é recusado) e os `formats`, na ordem escrita. `frame` escolhe o quadro dos PNGs do item e exige `png` em `formats`. `variant` (a mesma regra do `name`) entra no nome dos arquivos do item, `<pack>-<tamanho>-<variante>.<ext>`, para o mesmo tamanho sair duas vezes no pack (por exemplo, com e sem enfeites); num pack com dois ou mais fundos, cada fundo leva o seu visual como variante. A variante não pode ter os segmentos `mask`, `background`, `sm` ou `lg`, nem fazer o nome passar por outro tamanho do mesmo tipo (`fullscreen` com `vertical` seria `fullscreen-vertical`). Os parâmetros se juntam nesta ordem: preset, `props` do item, tamanho e formato; só o `bleed` das `props` do item vale acima do tamanho, que continua fixando a caixa. Tudo é validado antes do primeiro render, com a mensagem apontando o item.

```sh
npm run render:pack -- neon --dry-run
npm run render:pack -- neon
npm run render:pack -- halloween --only borders/
npm run render:pack -- halloween --only masks/
npm run render:pack -- pastel --only chat-column --overwrite
npm run render:pack -- caminho/meu-pack.json --dry-run
```

`--dry-run` lista cada arquivo planejado com as dimensões, o FPS e os frames (ou o quadro, no PNG), a velocidade real do movimento e se o arquivo já existe, sem renderizar nada. `--only <texto>` exporta só os arquivos cujo caminho contém o texto. `--overwrite` substitui arquivos prontos. Um caminho terminado em `.json` usa esse manifesto no lugar de `packs/<nome>.json`. O resultado fica assim:

```text
out/packs/neon/
├── manifest.json
├── backgrounds/
│   ├── neon-background.webm
│   └── neon-background.png
├── chat/
│   ├── neon-chat-standard.webm
│   └── neon-chat-standard.png  …
├── text-boxes/
│   └── neon-label.webm  …
├── twitch-panels/
│   ├── neon-twitch-panel.gif
│   └── neon-twitch-panel.png
├── borders/
│   ├── neon-webcam-16x9.webm
│   ├── neon-webcam-16x9.png  …
│   └── neon-fullscreen.webm
└── masks/
    └── neon-webcam-16x9-mask.png  …
```

As pastas repetem as do Studio, mais `twitch-panels/` para o painel da Twitch e `masks/` para as máscaras. Cada arquivo se chama `<pack>-<peça>[-<variante>].<ext>`: a peça é `background` no fundo, o id do tamanho num overlay do catálogo e `<L>x<A>[-circle]` num tamanho livre; a variante é a do item (`plain`, ou o visual do fundo no `halloween`, que tem três: `halloween-background-haunted-mansion.webm`). `manifest.json` reúne, para cada arquivo, os dados do [JSON de posição](#exportar) (`canvas`, `box`, `content`, `hole`, `header`, `bleed`, FPS, frames, formato, alpha e velocidade real), com as chaves em inglês para ferramentas; os JSONs avulsos de cada arquivo são incorporados a ele e removidos da pasta do pack. Cada borda de janela aponta a sua máscara em `mask`, e as máscaras têm `"role": "mask"`. Cada entrada grava também o `propsHash`, o hash das props de que o arquivo saiu: um arquivo pronto cujo item mudou é renderizado de novo. O `manifest.json` fica na pasta do pack e nunca vai para o comprador; cada build poda as entradas que o plano completo não tem mais.

As bordas de janela vêm com uma máscara por tamanho, `masks/<pack>-<tamanho>-mask.png`: um PNG do tamanho da janela (640×360 em `webcam-16x9`), com a janela arredondada em branco opaco sobre transparência. A borda arredonda sozinha os cantos de uma câmera retangular até um raio de cerca de 2,4 vezes `thickness`; acima disso, os cantos da câmera aparecem por fora da moldura, e a máscara resolve. Nas câmeras redondas a máscara é obrigatória: `<pack>-webcam-round-sm-mask.png`, `<pack>-webcam-round-mask.png` e `<pack>-webcam-round-lg-mask.png` são discos brancos do tamanho da câmera (280, 400 e 560 px), e é ela que transforma a câmera retangular em redonda; sem ela, os cantos da câmera aparecem fora do anel. No OBS, clique com o botão direito na fonte da câmera, abra **Filtros**, acrescente **Máscara de imagem/mistura**, escolha o tipo **Máscara alfa** (canal alfa ou de cor; a máscara serve para os dois) e aponte o PNG. Posicione a câmera sobre a caixa da borda (o `box` do manifesto, ou seja, `bleed` px para dentro do canto do arquivo) e deixe a borda acima dela. Como a máscara depende só da janela, todos os temas do mesmo tamanho e raio usam a mesma; se um pack tem o mesmo tamanho com raios diferentes, cada máscara leva o raio no nome (`<pack>-webcam-square-mask-radius-200.png`). As molduras de tela não precisam de máscara. Fora do pack, a máscara sai com `mask: true` num JSON e bleed 0, por exemplo `npm run render:png -- BorderLoop --props mask.json --size webcam-square --bleed 0`, com `{"mask": true, "radius": 24}` em `mask.json`, com o mesmo `radius` da borda (24 é o do tema pastel; neon usa 16, glass 20, halloween e halloween-midnight 12, halloween-haunted-mansion 10, halloween-haunted-interior 8 e halloween-cobweb 38); o arquivo se chama `out/BorderLoop-webcam-square-mask.png`. Na câmera redonda o raio não importa: `npm run render:png -- BorderLoop --props mask.json --size webcam-round --bleed 0`, com `{"mask": true}`, gera o disco `out/BorderLoop-webcam-round-mask.png`.

O builder usa um único bundle e exporta um arquivo por vez. Arquivos já prontos são pulados (`already exists, skipping.`), e o `manifest.json` é regravado depois de cada arquivo: se o build parar no meio, rode o mesmo comando de novo e ele continua de onde parou. Os renders em andamento do pack ficam em `out/.scratch/packs/<nome>/`, fora da pasta do pack; as sobras de um build interrompido (inclusive pastas `.asset-render-*` dentro do pack, de versões anteriores) são apagadas no começo do build seguinte, e o `--dry-run` avisa quantas há. Antes de começar, confere o espaço livre em disco e recusa com menos de 3 GiB; antes de cada arquivo, para com menos de 2 GiB, dizendo quanto há e como retomar (o piso é o mesmo de todo render, em `scripts/disk.ts`).

Os manifestos pedem `webm` e `png` em todos os itens, exceto o painel da Twitch, que sai em `gif` e `png`. MOV é opcional porque os arquivos são enormes (veja [Formatos](#formatos)): para entregar a versão de edição, acrescente `"mov"` aos `formats` dos itens que precisam dela, de preferência num manifesto separado, e confira o total com `--dry-run` antes de renderizar:

```json
{"composition": "BlockLoop", "preset": "block-neon", "sizes": ["lower-third", "title"], "formats": ["webm", "mov", "png"]}
```

### Delivery

The buyer gets one zip per pack, never the pack folder. A pack is ready when `render:pack` and `zip:pack` pass:

```sh
npm run zip:pack -- halloween-midnight --check   # every check, compared with the existing zip; writes nothing
npm run zip:pack -- halloween-midnight           # writes out/deliveries/halloween-midnight-overlay-pack.zip
```

- **What goes in.** Exactly the files of the whole plan, the same list as `--dry-run`, masks included; the list never comes from the folder or the manifest. `manifest.json`, `preview.html` and any other loose file stay out (loose files are listed as a warning; `.DS_Store` and `._*` pass in silence). There is no root folder: the entries are the pack's folders (`backgrounds/`, `chat/`, `text-boxes/`, `twitch-panels/`, `borders/`, `masks/`), files only, and "Extract all" makes the folder named after the zip.
- **What it refuses, writing nothing.** A missing, empty or linked planned file (`Missing N planned files in out/packs/<name>: … Run npm run render:pack -- <name> to finish the pack.`); a file whose first bytes are not its format; a manifest that is not the plan's (another name, missing or stale entries, a mask not recorded as one, a props hash missing or other than the plan's); a name outside the buyer rule (`<folder>/<pack>-<piece>[-<variant>].<ext>`, the pack's own name first, at most 100 characters, unique regardless of case; the plan already refuses such a name, so `--dry-run` and `render:pack` stop on it before any render); signs of an interrupted build (sidecars, `.asset-render-*`, `manifest.json.tmp`); a file that changes while the zip is read; a zip of 4 GiB or more (`The pack is over 4 GiB: ZIP64 is not supported; split the formats into another pack.`); and less free disk than the zip plus 1 GiB. The one change a refused run makes is clearing the partial file of an interrupted write (see Safe write); `--check` leaves even that.
- **Same files, same zip.** Entries are stored without compression (WebM, PNG and GIF are compressed already), dated 1980-01-01 00:00, mode 0644 and sorted by the bytes of their path, so the same files give the same zip, byte for byte. A new render does not give the same bytes, so the sha256 names the version that was sold: `Zip: out/deliveries/<pack>-overlay-pack.zip, N files, X MiB, sha256 …`, or `Already up to date.` when nothing changed.
- **Safe write.** The zip is written to `out/deliveries/.<pack>-overlay-pack.zip.partial`, flushed, read back (name, size, CRC and offset of every entry) and only then renamed over the old one: an interrupted write leaves the old zip as it was, and the next run without `--check` removes the partial file before its checks.
- **`--check`** exits 0 when the zip is up to date, 2 when there is none or it differs, and 1 when a check fails.
- **Where it goes.** A kit is about 1 GB and an Etsy listing takes 5 files of 20 MB, so the zip goes to R2 and its link goes into the pack guide (`<pack>-guide.pdf`), the only file of the listing.

## Wuthering Waves: Azure Lotus

`WutheringWavesLoop` is an **SVG/WebGL** streaming background inspired by **Wuthering Waves**: a blue-and-gold waterside illustration with layered lotus, a curved boat, distant eaves and pine, procedural paper/ink texture, and precise thin gold details informed by the game's UI. The scene uses no image assets. Its palette combines azure `#1B3E6D`, cream `#ECDCB6`, turquoise `#48B9C6` and gold `#DBBE8D`. The preset defines a **16-second loop at 1920×1080 and 60 fps**, without audio.

UI references are real launch-era captures from [GamesRadar (Terminal and Convene)](https://www.gamesradar.com/games/rpg/the-wuthering-waves-wish-convene-gacha-system/), [Gamerpillar (Resonator/Echo)](https://gamerpillar.com/how-to-tune-the-echo-in-the-echoes-interface-in-wuthering-waves/) and [Dot Esports (Map)](https://dotesports.com/wuthering-waves/news/how-to-get-the-lootmapper-in-wuthering-waves), published in May–June 2024. They inform the fine ivory/gold lines, blue-gray depth and asymmetric spacing; the waterside illustration is an original interpretation.

**Status: visual preview awaiting review; not yet approved for release.**

**Visual review:** inspect the full composition and enlarged junctions, including at motion extremes. Trace every structural element to its support: bridge landings must meet visible terrain, posts must meet both deck and rail, building steps need continuous risers, and plant stems must enter their leaves or flowers. Check occlusion and depth so a valid geometric overlap also reads as a connection. Isolated strokes must read as intentional ornament or texture, never detached construction parts. Unit tests alone do not complete this review.

In Studio, `atmosphere` controls mist, `resonance` adjusts the light effects, `particleCount` sets the number of particles, `motion` adjusts movement and `centerShade` darkens the central content area. The composition defaults to seed `1403` and WebM output; the preset selects MP4 for an OBS media source with **Loop** enabled. Official render commands select the ANGLE backend automatically. For a render launched from Studio, choose **angle** under **OpenGL renderer**.

```sh
npm run render:mp4 -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json
npm run render:webm -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json
npm run render:png -- WutheringWavesLoop --props presets/wuthering-waves-azure-lotus.json --frame 0
```

## Halloween: noite de outono

Selecione `HalloweenLoop` no Studio. O preset `presets/halloween-midnight.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM, com os principais elementos concentrados nas bordas. Não há texto, imagens externas, fontes adicionais ou áudio.

A lua tem halo e crateras sutis; os morcegos descrevem trajetórias fechadas com batidas de asas; névoa, galhos e luzes flutuantes se movem lentamente. As abóboras permanecem ancoradas ao chão e variam a luz interna suavemente. A seed controla estrelas, morcegos e luzes; alterar a quantidade de uma camada não reorganiza as outras.

`colors[0]` controla névoa e atmosfera, `colors[1]` o luar e as luzes, e `colors[2]` as abóboras. Se usar apenas duas cores, as abóboras adotam a primeira. `batCount: 0` e `emberCount: 0` ocultam essas camadas; `fogIntensity: 0` remove a névoa. `moonScale` altera o tamanho da lua e de seu halo.

Com `transparent: true` e `outputFormat: "webm"`, o céu de fundo desaparece, preservando lua, estrelas, cenário, abóboras e névoa com alpha. Em MP4/GIF, todos os elementos continuam compostos sobre `backgroundColor`.

**Kit de overlays.** O tema [`halloween-midnight`](#temas) veste chat, blocos e bordas para este fundo, com os mesmos 12 s e a seed 31: `presets/chat-halloween-midnight.json`, `presets/block-halloween-midnight.json` e `presets/border-halloween-midnight.json`, e o pack sai com `npm run render:pack -- halloween-midnight` (`--dry-run` para conferir antes). Os enfeites `midnight` trazem os mesmos morcegos do fundo batendo as asas no canto superior direito, as abóboras com o rosto aceso e estrelas e brasas ao longo do contorno. Os enfeites moram no bleed, então deixe cerca de 48 px livres em volta das webcams (72 px na `webcam-16x9-lg` e 96 px no `gameplay`, onde os enfeites saem ampliados) e 32 px em volta do chat e dos blocos, inclusive até a borda da tela e entre uma peça e outra: os morcegos e as abóboras ficam nessas margens e seriam cortados ou cobertos.

## Halloween: mansão assombrada

Selecione `HauntedMansionLoop` no Studio. O preset `presets/halloween-haunted-mansion.json` cria um ciclo de **16 segundos, 1920×1080 e 60 fps** em MP4/WebM. A mansão vitoriana ocupa o lado direito; árvores secas e grades enquadram as bordas, deixando o centro e a região central esquerda escuros para conteúdo da stream. Os valores iniciais são `seed: 81`, `backgroundColor: #0E1520` e uma paleta de névoa fria, luar pálido e âmbar. A cena é desenhada em SVG, sem texto, imagens externas, fontes adicionais ou áudio.

A arquitetura permanece fixa enquanto a iluminação das janelas varia lentamente, bancos de neblina baixa atravessam a frente da mansão e das grades em camadas, a poeira flutua e os morcegos percorrem trajetórias fechadas com batidas de asas. A neblina se concentra na base do cenário, preservando a área central para conteúdo da stream. O movimento depende do frame, da duração e da seed, mantendo a continuidade do ciclo.

`colors[0]` controla névoa e atmosfera, `colors[1]` a lua e a poeira, e `colors[2]` as janelas e os lampiões. Com apenas duas cores, janelas e lampiões adotam a primeira. `batCount: 0` e `moteCount: 0` ocultam essas camadas; `fogIntensity` começa em `0.75` e controla os bancos baixos de neblina — em `0`, eles desaparecem, mas as nuvens altas permanecem. `windowIntensity` ajusta a intensidade da iluminação quente e `moonScale` altera o tamanho da lua. Esses controles também podem ser salvos no Studio com **Save default props**.

Com `transparent: true` e `outputFormat: "webm"`, o céu e a vinheta atmosférica desaparecem, preservando o cenário e a névoa com alpha. Em MP4/GIF, todos os elementos são compostos sobre `backgroundColor`. Use `npm run render:webm -- HauntedMansionLoop --props presets/halloween-haunted-mansion.json` para o WebM ou troque por `render:mp4` / `render:gif` para os formatos opacos, sempre com os perfis oficiais descritos acima.

**Kit de overlays.** O tema [`halloween-haunted-mansion`](#temas) veste chat, blocos e bordas para este fundo, com os mesmos 16 s e a seed 81: `presets/chat-halloween-haunted-mansion.json`, `presets/block-halloween-haunted-mansion.json` e `presets/border-halloween-haunted-mansion.json`, e o pack sai com `npm run render:pack -- halloween-haunted-mansion`. Os enfeites `haunted-mansion` repetem o lampião, a grade e as janelas da mansão: lanternas de ferro com vidro âmbar tremulando no ritmo das do fundo, grade de lanças, rosácea e lancetas no topo das caixas largas, arandelas nas laterais das bordas grandes e um portão embaixo. A névoa do chat corre quase à velocidade da névoa do fundo; nos blocos ela fica parada, para o GIF do painel da Twitch continuar leve. Os enfeites moram no bleed, então deixe cerca de 48 px livres em volta das webcams (72 px na `webcam-16x9-lg` e 96 px no `gameplay`, onde os enfeites saem ampliados) e 32 px em volta do chat e dos blocos, inclusive até a borda da tela e entre uma peça e outra: lanternas, grade e portão ficam nessas margens.

## Halloween: interior da mansão

Selecione `HauntedInteriorLoop` no Studio. O preset `presets/halloween-haunted-interior.json` cria um ciclo de **16 segundos, 1920×1080 e 60 fps** em MP4/WebM, pensado como fundo de stream. Os valores iniciais são `seed: 113`, `backgroundColor: #080D10` e uma paleta de verde acinzentado, luar pálido e âmbar. A cena é desenhada em SVG, sem texto, imagens externas, fontes adicionais ou áudio.

O salão é visto em perspectiva central, com um único ponto de fuga no centro do quadro (960, 540). A sala é modelada em metros e projetada por uma só câmera. Rodapé, lambril, friso e cornija contornam as quinas sem emendas. Juntas do piso, teto, janelas e cortinas recuam para o mesmo ponto, e o espaçamento encurta com a profundidade.

A área de conteúdo é o retângulo de **1100×620 pixels** centrado no quadro (x de 410 a 1510, y de 230 a 850). A parede do fundo ocupa exatamente essa área: uma captura de câmera ou de jogo posicionada ali fica embutida na sala. Teto, piso e paredes laterais formam a moldura em volta, e as quinas da sala seguem as diagonais do quadro. Sem captura, a parede mostra um grande arco escuro que leva a um corredor sombrio, e a faixa central (x de 610 a 1310, y de 400 a 650) fica inteira sobre esse vão, calma para títulos. Nada se move dentro da área de conteúdo, em nenhum frame e com qualquer seed.

A hierarquia vai do centro para as bordas. As velas são a luz principal: dois candelabros de chão nos cantos inferiores aquecem parede, veludo e piso, e um lustre em anel pende do teto acima da área de conteúdo, sem entrar nela. O luar é o contraponto frio: cada parede lateral tem uma janela ogival com cortinas de veludo carmim, e há uma lua só, baixa, do lado de fora da parede direita, a mesma que ilumina a porta aberta e a escada do corredor. Pela janela direita, ela projeta no piso a forma da janela, com as sombras do mainel, das travessas e do rendilhado, alongada em diagonal desde o pé da parede. Longe da janela, as bordas se suavizam e a luz enfraquece; um feixe suave liga o vidro ao piso e se apaga antes da área de conteúdo. A janela esquerda fica de costas para a lua: o vidro mostra o céu noturno, mais apagado, e só uma claridade difusa e fraca chega ao piso junto à parede. Retratos, damasco, rachaduras e teias ficam em segundo plano, em contraste baixo.

O lustre oscila suavemente, as chamas e a luz das velas variam, o luar respira, os olhos dos retratos aparecem de vez em quando, a névoa se move junto ao piso e a poeira flutua nas faixas laterais. Os movimentos e a iluminação dependem exclusivamente do frame, dos parâmetros e da seed, com continuidade de posição e velocidade na emenda do ciclo.

Lá fora caem relâmpagos, um em cada janela, em momentos escolhidos pela seed e longe da emenda do ciclo. Cada um tem um clarão rápido, um segundo clarão 150–250 ms depois e uma cauda que se apaga em até 0,8 s. O raio aparece só na janela voltada para ele, por trás do chumbo, das árvores e do rendilhado de pedra. As duas janelas clareiam juntas, mais forte a do raio. Do lado do raio, o clarão acende a parede em volta da lanceta, a borda do candelabro voltada para a janela e um brilho largo e macio no piso, sem o desenho dos caixilhos, porque o raio e as nuvens acesas são uma fonte de luz grande, e não um ponto como a lua. A poça do luar não se intensifica com o clarão. Tudo isso fica fora da área de conteúdo. Ciclos a partir de 3 segundos têm dois relâmpagos; de 1,5 a 3 segundos, um; abaixo de 1,5 segundo, nenhum. Entre o início de dois relâmpagos passam ao menos 1,5 segundo, então nenhum segundo tem mais de dois clarões.

`colors[0]` controla névoa e atmosfera, `colors[1]` o luar, o vidro e a poeira, e `colors[2]` as velas. Com apenas duas cores, as velas adotam a primeira. `dustCount: 0` remove a poeira; `fogIntensity: 0` remove a névoa. `candleIntensity` ajusta a luz das velas e do lustre, `moonlightIntensity` a força do luar na janela direita (e da claridade difusa na esquerda), `hauntingIntensity` a aparição dos olhos nos retratos, `chandelierSway` a amplitude da oscilação do lustre e `lightningIntensity` a força dos relâmpagos (padrão 0,7; `0` desliga os clarões). As intensidades e a oscilação variam de 0 a 1; `dustCount` aceita inteiros de 0 a 100. Os controles podem ser salvos no Studio com **Save default props**.

Com `transparent: true` e `outputFormat: "webm"`, a sala se abre sobre o jogo. Somem a parede do fundo, o arco, o campo central do piso, o teto e a vinheta. Ficam as paredes laterais com janelas, cortinas e retratos, as faixas de piso junto a elas com os candelabros, e o lustre, que passa a pender da borda superior pela corrente. As peças mantidas são opacas, sem rampas de transparência. Brilhos, névoa e poeira ficam sobre elas, e os cortes têm acabamento escuro. O reflexo do luar no piso some com o campo central, e o clarão dos relâmpagos é pintado só no miolo das peças mantidas, sem alterar o alpha. A área de conteúdo fica totalmente transparente. Em MP4/GIF, a cena é composta sobre `backgroundColor`. Para exportar o preset em MP4, use `npm run render:mp4 -- HauntedInteriorLoop --props presets/halloween-haunted-interior.json`; troque por `render:webm` ou `render:gif` para os outros formatos, mantendo os perfis oficiais descritos acima.

**Kit de overlays.** O tema [`halloween-haunted-interior`](#temas) veste chat, blocos e bordas para este fundo, com os mesmos 16 s e a seed 113: `presets/chat-halloween-haunted-interior.json`, `presets/block-halloween-haunted-interior.json` e `presets/border-halloween-haunted-interior.json`, e o pack sai com `npm run render:pack -- halloween-haunted-interior`. Os enfeites `haunted-interior` trazem o latão, as velas e o veludo do salão: candelabros com a mesma chama e o mesmo tremor das velas do fundo, arandelas de duas velas e sanefas de veludo com borlas. Os presets ligam `lightning`, e com a mesma seed e duração os relâmpagos caem nos mesmos instantes do fundo: painéis, molduras e candelabros clareiam junto com as janelas do salão, mais forte do lado do raio. No OBS, uma fonte de mídia recomeça do início quando a cena volta a ficar ativa (se a opção de reiniciar ao ativar estiver ligada, o padrão); por isso os overlays só relampejam junto com o fundo quando começam juntos: ponha o fundo e os overlays na mesma cena, com a mesma opção. Os enfeites moram no bleed, então deixe cerca de 48 px livres em volta das webcams (72 px na `webcam-16x9-lg` e 96 px no `gameplay`, onde os enfeites saem ampliados) e 32 px em volta do chat e dos blocos, inclusive até a borda da tela e entre uma peça e outra; em especial, deixe pelo menos 96 px entre a moldura do jogo e a borda da tela, para as velas não serem cortadas.

## Halloween: teias de aranha

Selecione `CobwebLoop` no Studio. O preset `presets/halloween-cobweb.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM, com as teias concentradas nos quatro cantos — a maior delas no canto superior direito, sob a lua — e o miolo do quadro livre de elementos grandes; apenas a poeira atravessa o quadro inteiro, em brilho baixo, e a névoa corre rente ao chão, abaixo da área central. Os valores iniciais próprios da composição são `seed: 47`, `backgroundColor: #100B1B` e a paleta abaixo. Não há texto, imagens externas, fontes adicionais ou áudio.

Cada teia nasce de fios radiais e de anéis de captura finos, em arcos que cedem na direção do miolo da teia, ancorado no canto, e pendem um pouco com o próprio peso; o anel externo, mais forte, fecha o contorno. A seed define onde cai o rasgo, sempre à vista, com pontas partidas pendendo cada uma de um nó, e as pequenas irregularidades; só as duas teias de cima têm um fio rompido, com uma gota na ponta. Nem esse fio nem as pontas do rasgo pendem junto da linha de uma aranha, mesmo com `spiderCount: 3`. O desenho de cada teia não muda durante o ciclo; a brisa apenas o enverga. Os raios sempre terminam no anel externo, que nunca é rasgado, então nenhum raio fica com a ponta solta no ar.

Uma só brisa cruza o quadro da esquerda para a direita a cada ciclo — uma rajada, um sopro mais fraco e depois calmaria: as teias, presas pelo miolo e pelos raios das duas bordas, enfunam a favor do vento, primeiro as da esquerda e depois as da direita, levando junto o orvalho, as pontas do rasgo e o fio rompido; a mesma rajada inclina os fios de seda, empurra mais a poeira próxima que a distante e aumenta o balanço das aranhas. Com o miolo preso no canto, as teias também balançam e respiram devagar, fora de compasso umas com as outras, e cada uma respira com a sua própria amplitude. Uma faixa de luar percorre a seda de cada teia, de um lado a outro do leque, e as gotas de orvalho faíscam uma a uma quando ela passa, mantendo um brilho discreto entre as passagens. Os fios de seda pendem de nós fixos acima da borda superior, bem espaçados entre si e da linha de cada aranha, e balançam pela ponta, com uma gota no fim. São mais longos nas laterais e mais curtos sobre o centro, exceto na coluna de cada uma das três aranhas possíveis, mesmo das que `spiderCount` oculta: ali ficam curtos o bastante para terminar acima das pernas da aranha, e por isso os fios junto à borda direita são os mais curtos, qualquer que seja `spiderCount`. A poeira sobe devagar em profundidades diferentes — a mais próxima é maior e vagueia mais — e some antes de recomeçar embaixo. Cada aranha repete a mesma cena no próprio fio, balançando como um pêndulo: descansa no alto, se solta, é segurada pela linha ainda em queda e quica nela até parar, descansa embaixo e volta a subir em quatro puxões. Em repouso, as pernas mal se mexem; enquanto a aranha cai ou sobe, elas se movem como se ela caminhasse. Com `spiderCount: 3`, as três aranhas se revezam e nunca caem juntas.

A luz vem de uma lua rente à borda de cima, perto do canto superior direito: a teia principal aparece em contraluz diante do halo; em cada teia, os raios, os anéis e o fio rompido ganham uma borda clara deslocada para o lado em que a lua está, vista do canto onde a teia se prende, com a sombra do lado oposto; os fios de seda pendurados têm a borda clara do lado da lua e a sombra do outro; e as gotas são contas de vidro com o reflexo virado para ela. A aranha é uma silhueta escura de pernas articuladas, com cintura, palpos e uma ampulheta âmbar; um fio de luar contorna o corpo e as pernas do lado da lua. Uma brasa âmbar abaixo da borda inferior ilumina a teia inferior esquerda por baixo. `colors[0]` controla a seda, a névoa e o brilho difuso do céu em volta da lua, `colors[1]` o halo da lua, o luar que bate na seda e na aranha, os brilhos e o orvalho, e `colors[2]` o calor âmbar da luz baixa, do reflexo quente na teia inferior esquerda, da poeira e das gotas próximas dessa luz e da marca da aranha; o miolo das gotas e da poeira segue `colors[1]`, com um reflexo branco em cada gota. A poeira aparece onde a luz a alcança: clara sob a lua, âmbar sobre a brasa e mais fraca nos cantos escuros. Se usar apenas duas cores, o âmbar adota a primeira. A seed define a geometria das teias, os fios soltos, a poeira e o cintilar do orvalho; a brisa, a névoa e as aranhas fazem o mesmo percurso em qualquer seed. `webCount` escolhe quantos cantos recebem teia, na ordem superior direito (a teia principal, sob a lua), inferior esquerdo, superior esquerdo e inferior direito; `webCount: 0` remove as teias e, com elas, o orvalho. `strandCount: 0`, `moteCount: 0` e `spiderCount: 0` ocultam essas camadas; `dewIntensity: 0` apaga o orvalho e `mistIntensity: 0` remove a névoa. Alterar a quantidade de uma camada não reorganiza as outras.

Com `transparent: true` e `outputFormat: "webm"`, o céu de fundo, a vinheta e o brilho difuso em volta da lua desaparecem, preservando teias, orvalho, fios, aranhas, poeira e névoa com alpha. Como luz de fundo, restam apenas o halo da lua, no canto superior direito, e uma faixa âmbar na borda de baixo, ambos fora da área central; o luar e o reflexo âmbar sobre a seda continuam, e um contorno escuro discreto sob a seda mantém os fios legíveis sobre vídeo claro. A aranha tem o corpo opaco, a borda de luar das pernas a mantém visível sobre vídeo escuro, e o fio que a sustenta tem uma sombra discreta para não sumir sobre vídeo claro. Em MP4/GIF, todos os elementos são compostos sobre `backgroundColor`.

**Kit de overlays.** O tema [`halloween-cobweb`](#temas) veste chat, blocos e bordas para este fundo, com os mesmos 12 s e a seed 47: `presets/chat-halloween-cobweb.json`, `presets/block-halloween-cobweb.json` e `presets/border-halloween-cobweb.json`, e o pack sai com `npm run render:pack -- halloween-cobweb`. Os enfeites `cobweb` desenham as teias do fundo, com os mesmos fios, o rasgo e as pontas partidas, nos cantos das caixas, o orvalho faiscando quando passa a faixa de luar e a viúva-negra, pendurada no fio ao lado do chat e dos blocos e pousada na teia nas bordas. Ao longo da borda de cima pendem guirlandas de fios, presas em nós fixos, com gotas de orvalho nos pontos mais baixos e algumas pontas partidas; nas bordas de janela retangulares e nos blocos retangulares (menos as etiquetas e o painel da Twitch, que não tem guirlandas), outra guirlanda presa ao próprio quadro ao longo da borda de baixo. O âmbar só aparece na ampulheta da aranha e na brasa atrás da teia de baixo. Os enfeites moram no bleed, então deixe cerca de 48 px livres em volta das webcams (72 px na `webcam-16x9-lg` e 96 px no `gameplay`, onde os enfeites saem ampliados) e 32 px em volta do chat e dos blocos, inclusive até a borda da tela e entre uma peça e outra: teias, guirlandas e a aranha ficam nessas margens.

## Christmas: gilded garland

Select `ChristmasLoop` in the Studio. The preset `presets/christmas-gilded-garland.json` renders a seamless **20-second loop at 1920×1080 and 60 fps** with seed `1225`. The scene is pure SVG: no WebGL, text, images, fonts or audio.

A dark evergreen velvet backdrop keeps all the detail at the edges. A pine garland, bundled from overlapping sprigs that point away from the center, runs in two shallow swags across the top, wrapped in a gold ribbon, with a burgundy velvet bow at the center. Small glass baubles hang from the garland, and larger ones hang down both side columns on satin ribbons tied to the boughs with small bows. Frosted pine boughs with cones and holly fill the four corners, warm lights run along the garland, soft warm bokeh glows near the garland lights, behind the top boughs (above the hanging baubles) and in the lower corners, and snow falls slowly at two depths.

**Stream layout.** The content area, x 360–1560 and y 170–900, is kept for the webcam, the gameplay and the overlays. Only the small far snowflakes cross it, dimmed by `centerCalm`. Baubles, pine, lights, bokeh and sparkles stay outside it even at their widest swing, and the tests enforce this. The bottom center between the lower boughs stays open for a lower third.

**Motion.** Baubles swing on their ribbons, the pine boughs and the bow tails sway, a slow chase runs along the garland lights, sparkles glint and the bokeh drifts. Nothing flashes. Every movement repeats a whole number of times per cycle, so shorter cycles move faster: keep `durationSeconds` at 16 s or more (at 12 s the near snow falls at about 190 px/s).

**Palette.** `colors[0]` is the evergreen (needles, holly, the velvet tint, evergreen baubles), `colors[1]` the burgundy (bow, berries, burgundy baubles) and `colors[2]` the gold (ribbons, bauble caps and bands, lights, sparkles, bokeh and the warm glow behind the bow and in the lower corners). The bokeh behind the greenery leans amber whatever the palette (the gold mixed toward amber), and only the faint orbs in front of the pine are plain gold: each orb is a soft warm core that fades out at its edge, never a pale disc, which over the green velvet would read as grey. With only two colors, the ribbons take the second color, the bauble caps and rings turn plain silver, and the lights, glints, bokeh and bands take a light tint of the second color (the bokeh mixed toward amber again); colors after the third are ignored. Snow, pine cones and stems keep fixed colors, so any palette still reads as pine and snow.

**Controls.** `baubleCount` removes baubles in a fixed order, `snowCount`, `bokehCount` and `sparkleCount` set their layers without rearranging the others, `sway: 0` holds the baubles, bow tails and boughs still (snow, bokeh, sparkles and the light chase keep moving), `lightGlow: 0` leaves the bulbs unlit as glass beads and also turns off the sparkles and the bauble glints, `twinkle: 0` keeps every bulb steady (at 1 the chase dims each bulb to half its glow and back) and `centerCalm` dims the snow over the content area (at 1 it keeps 15% of its strength) and darkens the center. `snowCount: 0` leaves a completely still center.

**Transparency.** With `transparent: true` and `outputFormat` set to `webm`, `mov` or `png`, the velvet backdrop, the corner warmth, the center shade and the vignette are left out, and so are the bokeh orbs behind the greenery, which would read as smudges over bright footage. What remains is a festive frame over the game: garland, bow, baubles, corner pine with soft drop shadows, lights, the faint orbs in front of the pine, sparkles and snow. MP4 and GIF composite everything over `backgroundColor`. There is no command-line switch for transparency: save a copy of the preset with `"transparent": true`.

```sh
npm run render:webm -- ChristmasLoop --props presets/christmas-gilded-garland.json
npm run render:mp4 -- ChristmasLoop --props presets/christmas-gilded-garland.json
npm run render:png -- ChristmasLoop --props presets/christmas-gilded-garland.json --frame 0
```

## Kawaii: constelação pastel

Selecione `KawaiiLoop` no Studio. O preset `presets/kawaii-constellation.json` cria um ciclo de **12 segundos, 1920×1080 e 60 fps** em MP4/WebM. Os valores iniciais próprios da composição são `seed: 7`, `backgroundColor: #FFF7F4` e a paleta de morango, baunilha e matchá. Não há personagens, texto, imagens externas, fontes adicionais ou áudio.

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

## Vaporwave: horizonte neon

Selecione `VaporwaveLoop` no Studio. O preset `presets/vaporwave-horizon.json` cria um ciclo de **16 segundos, 1920×1080 e 60 fps** em MP4/WebM, pensado como fundo de overlay de stream. Os valores iniciais próprios da composição são `seed: 88`, `backgroundColor: #120C2E` e a paleta vaporwave clássica de rosa, ciano, amarelo-claro e lilás. A cena é desenhada em SVG, sem texto, imagens externas, fontes adicionais ou áudio.

Na tela há um céu noturno índigo, com brilho lilás no alto, estrelas e alguns cintilos de quatro pontas; um grande sol retrô fatiado, do amarelo-claro ao rosa e ao lilás, com halo e reflexo no chão; cordilheiras aramadas em ciano, com uma segunda cordilheira mais pálida atrás e uma silhueta distante no horizonte; um chão em grade neon em perspectiva, com linhas rosa e colunas ciano; palmeiras escuras nas laterais, com um fio de luz neon só no lado voltado para o sol; e sólidos aramados translúcidos (octaedro, icosaedro e pirâmide) flutuando nos cantos. A malha das montanhas segue curvas de nível — crista, duas cotas intermediárias e o pé — ligadas por meridianos e diagonais alternadas, e as faces voltadas para o sol recebem mais luz. Nenhum pico encosta na borda do sol: um pico que ficaria a menos de 40 px dela é empurrado para fora do disco, ou mais para dentro dele. Nenhum pico fica a menos de 120 px da copa das palmeiras pequenas do horizonte, então elas nunca parecem pousadas num pico. As cristas se apagam logo acima do horizonte, então a linha rosa do horizonte segue contínua, sem trechos em ciano. As fatias do sol mostram o céu noturno através do disco, e o halo para no horizonte: abaixo dele, o chão recebe só o reflexo achatado do sol.

A área de conteúdo é o retângulo de **1100×620 pixels** centrado no quadro (x de 410 a 1510, y de 230 a 850). Palmeiras, sólidos, cintilos e estrelas cadentes nunca entram nela, em nenhuma fase do ciclo e com qualquer seed: a conta usa a geometria desenhada, incluindo o balanço das folhas, a flutuação dos sólidos e o brilho em volta deles, e é conferida pelos testes.

A grade avança em direção à câmera. Cada linha nasce transparente numa névoa de profundidade e sai pela borda de baixo, então a faixa perto do horizonte fica calma, sem uma pilha de linhas finas. Os cortes do sol descem devagar, duas faixas por ciclo, e abrem a partir de zero. As folhas das palmeiras balançam poucos graus, os sólidos dão uma volta inteira por ciclo e flutuam alguns pixels, as estrelas e os cintilos piscam devagar, e o neon do horizonte e das montanhas respira. As estrelas cadentes cruzam só a faixa de cima, sempre voando para o lado oposto ao do sol (com o sol no centro, passam bem acima dele), e ficam invisíveis na emenda do ciclo; como todo o resto, repetem o mesmo trajeto a cada ciclo. As montanhas não se movem: a geometria delas depende apenas da seed e da posição do sol.

`colors[0]` é o rosa neon das linhas do chão, do horizonte e da névoa sobre ele, do meio do sol, do halo e do reflexo do sol, do fio de luz das palmeiras, da cordilheira de trás e do sólido do canto superior direito; `colors[1]` é o ciano das colunas do chão, das montanhas da frente, dos outros sólidos, do brilho do alto do céu e do halo das estrelas e das estrelas cadentes; `colors[2]` é o topo do sol e metade dos cintilos (a outra metade é branca); `colors[3]` é o lilás da névoa do céu, da base do sol, dos anéis dos troncos e das faces das montanhas e dos sólidos. A terceira e a quarta cores são opcionais: sem `colors[2]`, o topo do sol fica branco; sem `colors[3]`, a névoa usa `colors[0]`. Cores além da quarta são ignoradas. Qualquer cor aceita pelo Studio funciona, como `red`, `#abc` ou `rgba(255, 0, 128, 0.5)`; `backgroundColor` continua no formato `#RRGGBB` e também dá o tom das silhuetas das palmeiras.

- `speed` (0–12, inteiro, padrão `4`): linhas da grade que passam por ciclo. Mais linhas deixam o chão mais rápido; `0` deixa o chão parado. A velocidade é constante, inclusive na emenda: com 16 segundos e o padrão, uma linha nova chega a cada 4 segundos. Todo o movimento acompanha o ciclo, então ao aumentar `durationSeconds` aumente `speed` na mesma proporção para manter o ritmo do chão (32 s → `8`, 48 s → `12`); acima de 48 s o chão fica mais lento que o padrão. O balanço das palmeiras, o giro dos sólidos, os cortes do sol e o piscar das estrelas também se alongam com o ciclo. Para lives longas, `durationSeconds: 32` com `speed: 8` mantém o chão no ritmo do padrão e espaça a estrela cadente para uma passagem a cada 32 segundos.
- `sunPosition` (0,1–0,9, padrão `0.9`): posição horizontal do sol. Em `0.9` o disco ocupa x de 1580 a 1980, atrás das palmeiras: fica 70 px à direita da área de conteúdo, e a borda do quadro corta 60 px dele de propósito, em vez de quase encostar nela; `0.1` é o espelho à esquerda. Perto do centro o sol desce: entre `0.35` e `0.65` ele fica meio posto, com o centro sobre o horizonte e o topo em y 544, de modo que só toca os últimos 16 px da faixa do título; entre `0.2` e `0.35` (e entre `0.65` e `0.8`) ele desce aos poucos. Os cortes acompanham a parte visível do disco. As montanhas abrem um vale embaixo do sol, e as estrelas cadentes voam para o lado oposto. O lado do sol é o mais claro do quadro: deixe chat e alertas do lado oposto, ou use `0.1` para levar o sol para a esquerda.
- `neonGlow` (0–1, padrão `0.7`): brilho do neon na grade, no horizonte, nas montanhas, no halo do sol e no fio de luz das palmeiras.
- `starCount` (0–200, padrão `90`): estrelas no céu. A cada dez estrelas o céu ganha também um cintilo de quatro pontas maior, até 12; em `0`, o céu fica sem estrelas e sem cintilos. Os cintilos ficam no céu aberto acima de y 230, fora da área de conteúdo e longe das copas das palmeiras, então nenhum se esconde atrás do sol, das montanhas ou das palmeiras.
- `shootingStars` (0–3, padrão `1`): estrelas cadentes por ciclo, sempre acima da área de conteúdo. Elas repetem o mesmo trajeto a cada ciclo — com o padrão, a mesma estrela cruza o alto do quadro a cada 16 segundos —, então em lives longas use `0`, ou a receita de 32 segundos descrita em `speed`.
- `palmCount` (0–3, padrão `2`): palmeiras em cada lateral. Com `1`, fica só a palmeira que se inclina para fora do quadro, a de menor presença sobre os cantos do jogo; `2` soma a palmeira grande, perto da câmera, que nasce da mesma touceira e forma um V com a primeira; `3` soma uma palmeira pequena, de pé no horizonte.
- `shapeCount` (0–4, padrão `2`): sólidos aramados. Os dois primeiros ficam nos cantos de cima, entre as palmeiras e a área de conteúdo; os outros dois, nos cantos de baixo.
- `centerShade` (0–1, padrão `0.6`): placa suave atrás da área de conteúdo, no formato de um quadro 16:9. Ela tem força total num retângulo 16:9 de 980×552 px no centro e se desfaz ao longo de 150 px, com cantos arredondados; nas quinas da área de conteúdo ainda passa da metade da força, então as quinas de uma câmera não ficam descobertas.

Alterar a quantidade de uma camada não reorganiza as outras: cada camada usa a própria sequência da seed. Aumentar estrelas, palmeiras ou sólidos mantém os que já estavam; as estrelas cadentes se redistribuem ao longo do ciclo.

Em MP4/GIF e no WebM opaco, `centerShade` escurece com `backgroundColor` o céu e as estrelas atrás do conteúdo e, com força menor, o chão abaixo do horizonte. As montanhas e o sol ficam por cima da placa. Com o sol no centro, meio posto abaixo do título, o disco perde no máximo 10% da opacidade e 20% do topo amarelo, mantendo o degradê de amarelo-claro a rosa; o halo, que chega à faixa do título, é atenuado em até 25%. Com os valores iniciais, um título branco na faixa central (x de 610 a 1310, y de 470 a 560) tem contraste mediano de cerca de 17,9:1, e o pior pixel fica acima de 12:1. No preset clássico, a mediana fica entre 15,3:1 e 15,9:1 ao longo do ciclo, e 95% dos pixels da faixa ficam acima de 8,8:1; só o topo do sol, nos últimos 16 px da faixa, fica claro. No WebM transparente não há o que escurecer; `centerShade` então apaga parcialmente o sol, as estrelas, os cintilos, as colinas distantes e o meio da linha do horizonte atrás do conteúdo. Em `1`, a linha do horizonte fica abaixo de 10% da opacidade entre x 800 e 1120, e as pontas continuam acesas.

Com `transparent: true` e `outputFormat: "webm"`, o céu, o brilho do alto, o chão, a placa e as faixas de névoa e de brilho que cruzam o horizonte inteiro desaparecem; do brilho do horizonte ficam só as poças nas laterais. Sol, estrelas, montanhas, grade, palmeiras e sólidos continuam com alpha suave. As montanhas são desenhadas juntas, com 45% de opacidade, para o jogo aparecer através delas: as cordilheiras não se somam onde se sobrepõem, e o sol, as estrelas e a cordilheira de trás não aparecem através das da frente. Só as cristas da frente são redesenhadas com o neon inteiro. A grade se dissolve mais cedo em direção ao horizonte, cobrindo só a parte de baixo do quadro. Perto da borda de baixo, onde o jogo costuma mostrar vida e munição, as linhas da grade que passam abaixo de y 976 ficam com no máximo 40% da opacidade e só recuperam o brilho aos poucos até y 912, as colunas ficam abaixo de metade da opacidade e os troncos das palmeiras se desfazem entre y 860 e 950. Em MP4/GIF, todos os elementos são compostos sobre `backgroundColor`.

Para exportar os presets com os perfis oficiais descritos acima:

```sh
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-horizon.json
npm run render:mp4 -- VaporwaveLoop --props presets/vaporwave-classic.json
npm run render:webm -- VaporwaveLoop --props presets/vaporwave-alpha.json
```

Troque `render:mp4` por `render:webm` ou `render:gif` para os outros formatos.

## Pontos: padrão em movimento

Selecione `DotGridLoop` no Studio. Os valores iniciais criam um ciclo de **8 segundos, 1920×1080 e 60 fps**: pontos lilás de 10 px, a cada 48 px, sobre azul-noite (`#10162B`), rolando na diagonal para baixo e para a direita. A cena é desenhada em SVG, sem imagens externas, texto ou áudio, e o padrão cobre o quadro inteiro em todos os frames, sem falhas nas bordas.

- `direction` (padrão `down-right`): `right`, `left`, `up` e `down` movem o padrão na horizontal ou na vertical; `up-right`, `up-left`, `down-right` e `down-left`, na diagonal, sempre a 45°.
- `layout` (padrão `aligned`): `aligned` enfileira os pontos em grade, com colunas e fileiras retas; `alternating` desloca uma fileira sim, outra não, em meio espaçamento. Os dois arranjos têm a mesma quantidade de pontos por área.
- `dotColor` (padrão `#7C8CFF`): cor dos pontos. Aceita qualquer cor do Studio, inclusive com transparência, como `rgba(255, 255, 255, 0.35)`.
- `dotSize` (1–96, padrão `10`): diâmetro dos pontos, em pixels. Com `dotSize` maior que `spacing`, os pontos vizinhos se fundem.
- `spacing` (16–240, padrão `48`): distância em pixels entre os centros de pontos vizinhos na fileira e entre uma fileira e a seguinte.
- `speed` (0–480, padrão `24`): velocidade em pixels por segundo, na direção escolhida; `0` deixa o padrão parado. Qualquer valor acima de zero anda pelo menos um passo por ciclo, como explicado abaixo.

Para o loop fechar, cada ponto precisa terminar o ciclo exatamente no lugar de outro ponto. Por isso a distância percorrida no ciclo é arredondada para o número inteiro de passos mais próximo do pedido, com pelo menos um passo quando `speed` é maior que zero. O passo é o menor deslocamento, na direção escolhida, que devolve o mesmo padrão:

| Direção | `aligned` | `alternating` |
| --- | --- | --- |
| Horizontal | `spacing` | `spacing` |
| Vertical | `spacing` | `2 × spacing` (a fileira deslocada só se repete duas fileiras depois) |
| Diagonal | `spacing × √2` | `2 × spacing × √2` |

Com os valores iniciais, 24 px/s durante 8 s pedem 192 px. A diagonal anda em passos de 67,9 px, então o ciclo percorre três passos, a 25,5 px/s. Na horizontal, os mesmos valores dão exatamente 24 px/s: quatro espaçamentos por ciclo. A diferença é de no máximo meio passo por ciclo: diminui em ciclos mais longos e pesa menos em velocidades maiores. Ao aumentar `durationSeconds`, a velocidade se mantém. O movimento é constante do primeiro ao último frame, inclusive na emenda. GIF (50 fps) e MP4/WebM (60 fps) percorrem a mesma distância por ciclo.

Com espaçamentos grandes, principalmente na diagonal e nas fileiras alternadas, o passo é longo e a velocidade muda aos saltos. Com `alternating` na diagonal, `spacing: 240` e 8 s, o passo tem 678,8 px e as velocidades possíveis são múltiplos de 84,9 px/s: um `speed` de 24 já anda a 84,9 px/s. Para um ajuste mais fino, alongue o ciclo ou diminua o espaçamento.

O padrão também não pode andar rápido demais para o espaçamento. Se, de um frame para o outro, os pontos andam metade do caminho até o vizinho, o olho liga cada ponto ao vizinho errado e o padrão parece ir para trás ou piscar, como a roda de carroça nos filmes. Por isso o schema recusa combinações em que um frame avança mais de 40% desse caminho, com uma mensagem que indica a velocidade máxima; a velocidade nunca é reduzida por conta própria. Isso só acontece com espaçamentos pequenos e velocidades altas, ou em ciclos de poucos frames. Na horizontal, com `spacing: 16`, o limite fica perto de 384 px/s em MP4/WebM e de 320 px/s em GIF, que tem menos frames por segundo.

A seed só desloca a grade dentro do quadro; espaçamento, tamanho e velocidade não mudam.

Com `transparent: true` e `outputFormat: "webm"`, o fundo fica transparente e só os pontos permanecem, com bordas suaves. Em MP4/GIF, os pontos são compostos sobre `backgroundColor`. Para exportar os presets com os perfis oficiais descritos acima:

```sh
npm run render:mp4 -- DotGridLoop --props presets/dots-classic.json
npm run render:mp4 -- DotGridLoop --props presets/dots-alternating.json
npm run render:webm -- DotGridLoop --props presets/dots-alpha.json
```

Troque `render:mp4` por `render:webm` ou `render:gif` para os outros formatos.

## Xadrez: tabuleiro em movimento

Selecione `CheckerboardLoop` no Studio. Os valores iniciais criam um ciclo de **8 segundos, 1920×1080 e 60 fps**: um tabuleiro de casas de 80 px em dois tons de azul-noite (`#141A33` e `#222C57`), rolando na diagonal para baixo e para a direita. A cena é desenhada em SVG, sem imagens externas, texto ou áudio, e o tabuleiro cobre o quadro inteiro em todos os frames e em qualquer inclinação, sem falhas nas bordas.

- `backgroundColor` (padrão `#141A33`) e `squareColor` (padrão `#222C57`): as duas cores do tabuleiro. Os quadrados de `squareColor` são desenhados sobre `backgroundColor`, que aparece nas casas entre eles. `squareColor` aceita qualquer cor do Studio, inclusive com transparência, como `rgba(255, 255, 255, 0.14)`; `backgroundColor` precisa ser opaca, no formato `#RRGGBB`.
- `squareSize` (16–480, padrão `80`): lado de cada casa, em pixels.
- `direction` (padrão `down-right`): `right` e `left` andam ao longo das fileiras, `up` e `down` ao longo das colunas, e `up-right`, `up-left`, `down-right` e `down-left` ao longo das diagonais do tabuleiro, sempre a 45° das fileiras. Sem inclinação, é o lado da tela que o nome diz.
- `angle` (−45–45, padrão `0`): inclinação do tabuleiro, em graus; valores positivos giram no sentido horário. O movimento gira junto: com `angle: -15` e `direction: "left"`, o tabuleiro desliza ao longo das fileiras inclinadas, para a esquerda e um pouco para baixo.
- `speed` (0–960, padrão `40`): velocidade em pixels por segundo; `0` deixa o tabuleiro parado. Qualquer valor acima de zero anda pelo menos um passo por ciclo, como explicado abaixo.

Com `angle` em `45` ou `-45`, as casas viram losangos e as diagonais do tabuleiro passam a correr na horizontal e na vertical da tela:

| Na tela | `angle: 45` | `angle: -45` |
| --- | --- | --- |
| Para a direita | `up-right` | `down-right` |
| Para a esquerda | `down-left` | `up-left` |
| Para cima | `up-left` | `up-right` |
| Para baixo | `down-right` | `down-left` |

Para o loop fechar, cada quadrado precisa terminar o ciclo exatamente no lugar de outro quadrado. Por isso a distância percorrida no ciclo é arredondada para o número inteiro de passos mais próximo do pedido, com pelo menos um passo quando `speed` é maior que zero. O passo é o menor deslocamento, na direção escolhida, que devolve o mesmo tabuleiro:

| Direção | Passo |
| --- | --- |
| Fileira ou coluna | `2 × squareSize` (a casa ao lado tem a outra cor) |
| Diagonal | `squareSize × √2` (a casa seguinte na diagonal tem a mesma cor) |

Com os valores iniciais, 40 px/s durante 8 s pedem 320 px. A diagonal anda em passos de 113,1 px, então o ciclo percorre três passos, a 42,4 px/s. Na horizontal, os mesmos valores dão exatamente 40 px/s: dois passos de 160 px por ciclo. Fora o mínimo de um passo, a diferença é de no máximo meio passo por ciclo: diminui em ciclos mais longos e pesa menos em velocidades maiores. Como `speed` é medido em px/s, aumentar `durationSeconds` não acelera nem freia o tabuleiro; só muda o arredondamento. Quando o pedido não chega a meio passo, o ciclo anda um passo inteiro, como no exemplo das casas grandes abaixo. O movimento é constante do primeiro ao último frame, inclusive na emenda, e a inclinação não muda o passo. GIF (50 fps) e MP4/WebM (60 fps) percorrem a mesma distância por ciclo.

Com casas grandes, o passo é longo e a velocidade muda aos saltos. Com `squareSize: 480` e 8 s, o passo numa fileira tem 960 px e as velocidades possíveis são múltiplos de 120 px/s: um `speed` de 40 já anda a 120 px/s. Para um ajuste mais fino, alongue o ciclo ou diminua as casas.

O tabuleiro também não pode andar rápido demais para o tamanho das casas. Se, de um frame para o outro, os quadrados andam metade do caminho até a casa vizinha da mesma cor, o olho liga cada quadrado ao vizinho errado e o tabuleiro parece ir para trás ou piscar, como a roda de carroça nos filmes. Por isso o schema recusa combinações em que um frame avança mais de 40% de um passo, com uma mensagem que indica a velocidade máxima; a velocidade nunca é reduzida por conta própria. Isso só acontece com casas pequenas e velocidades altas, ou em ciclos de poucos frames. Com `squareSize: 16`, o limite fica perto de 770 px/s em MP4/WebM e de 642 px/s em GIF, que tem menos frames por segundo, nas fileiras e colunas; nas diagonais, perto de 544 e 453 px/s.

A seed só desloca o tabuleiro dentro do quadro; tamanho, inclinação e velocidade não mudam.

Com `transparent: true` e `outputFormat: "webm"`, as casas de `backgroundColor` ficam transparentes e só os quadrados permanecem, com bordas suaves. Em MP4/GIF, os quadrados são compostos sobre `backgroundColor`. Para exportar os presets com os perfis oficiais descritos acima:

```sh
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-classic.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-diamonds.json
npm run render:mp4 -- CheckerboardLoop --props presets/checkerboard-tilted.json
npm run render:webm -- CheckerboardLoop --props presets/checkerboard-alpha.json
```

Troque `render:mp4` por `render:webm` ou `render:gif` para os outros formatos.

## WebGL: experimentos em shader

Selecione `WebGLLoop` no Studio e escolha o experimento em `experiment`. Cada experimento é um fragment shader WebGL2 desenhado em 1920×1080 a cada frame, pensado como fundo de overlay de live: cenas de "já começa", "volto já" e o fundo atrás da câmera e da captura do jogo.

| `experiment` | Visual |
| --- | --- |
| `aurora` | Três cortinas de aurora na metade de cima do céu, com raios verticais finos, dobras que deslizam de lado e acendem nas curvas, céu escuro embaixo e estrelas discretas que cintilam devagar. A primeira cor ilumina a base das cortinas; as seguintes sobem pelos raios. |
| `lava` | Lâmpada de lava: gotas de cera brilhante sobem, descem, se fundem e se separam pelas laterais, com poças nos cantos de baixo. As cores seguem a altura (primeira embaixo, última no topo) e se misturam sem acinzentar onde as gotas se fundem. O centro fica livre por construção. |
| `silk` | Dobras amplas de seda ou cetim ondulando devagar, com um brilho estreito ao longo de cada dobra e sombras profundas; a paleta tinge o tecido em faixas largas. |
| `caustics` | Fundo do mar: o leito de areia em perspectiva com a rede de luz que o sol desenha através das ondas, sumindo na névoa azul do horizonte; em cima, água aberta que escurece com a profundidade, raios de sol, o brilho ondulante da superfície e partículas em suspensão. A primeira cor é a da água; a segunda, a da areia; a última clareia os raios. |
| `cells` | Tecido de células, como vitral à noite: membranas finas e luminosas, pontos que circulam devagar, famílias de tons da paleta e algumas células que se enchem de luz de tempos em tempos. |
| `contours` | Curvas de nível de um relevo que respira devagar, com espessura constante, uma curva mestra a cada cinco e cores pela altitude. Nas encostas íngremes as linhas somem antes de se amontoar. |
| `nebula` | Nuvens de gás nas cores da paleta, com faixas escuras de poeira e nós de emissão, sobre um campo de estrelas finas que cintilam de leve. |
| `flow` | Série pastel, a partir de "Aurora Flow": uma fita grossa e acetinada entra pela esquerda, mergulha e sobe em curva até o canto de cima à direita, com a crista luminosa e uma segunda onda enevoada na sombra dela. Ondulações lentas percorrem a fita e a luz desliza pela crista; o alto à esquerda fica calmo para títulos. |
| `orbital` | Série pastel, a partir de "Orbital": esfera perolada e fosca num estúdio de fundo infinito, no terço direito do quadro. A paleta vira um degradê na esfera, como luzes coloridas que orbitam em volta dela; a esfera sobe e desce devagar e a sombra de contato acompanha a altura. |
| `neon` | Série pastel, a partir de "Neon Drift": um cetim dobrado na diagonal, com um plano calmo acima do vinco e uma encosta brilhante em azul-violeta abaixo; dois filetes finos de luz neon correm pelo vinco, com pulsos de luz deslizando por eles. |
| `layers` | Série pastel, a partir de "Liquid Layers": folhas de vidro colorido empilhadas em arcos concêntricos a partir do canto inferior esquerdo, cada uma com um fio de luz na borda e sombra macia; respiram uma depois da outra, com bordas que ondulam como líquido. |
| `haze` | Série pastel, a partir de "Sunset Haze": entardecer visto através de vidro fosco, com massas de cor que derivam como nuvens de luz e uma linha dourada luminosa que ondula de um lado ao outro do quadro. |
| `eclipse` | Série pastel, a partir de "Eclipse": discos enormes, um dentro do outro, com o centro fora do quadro no alto à esquerda; as faixas derivam com paralaxe, alargam e estreitam, e a luz corre ao longo dos aros. |
| `watercolor` | Aquarela: camadas transparentes de pigmento em volta das bordas do quadro, como uma moldura pintada à mão, com o papel mais claro no meio para o conteúdo. As camadas se misturam por subtração, como pigmento de verdade (azul sobre amarelo fica verde; uma segunda camada da mesma cor escurece o tom), com bordas secas mais escuras, franjas molhadas, flores de água, granulação no dente do papel e respingos. A tinta continua molhada: as manchas avançam, respiram e se abrem devagar sobre um papel que nunca se move. `backgroundColor` é o papel. |
| `mesh` | Gradiente em malha, a partir do "Mesh Gradient" dos shaders do Pixel Perfect: manchas de cor passeiam pelo quadro em laços lentos, cada uma no seu sentido, e se misturam com pesos pelo inverso da distância, então cada cor fica pura na sua mancha e as passagens entre elas ficam largas. Uma ondulação no miolo e um redemoinho suave nas bordas, que respira, curvam essas passagens. As cores se misturam em OKLab e recuperam parte da saturação que tons opostos perdem ao se misturar, então a passagem acinzenta menos (tons quase opostos, como rosa e menta, ainda passam perto do cinza). Cada cor da paleta aparece o mesmo número de vezes, em pelo menos seis manchas (cinco cores dão dez), arrumadas para que vizinhas tenham cores diferentes (com duas cores isso nem sempre é possível). Aqui `scale` muda o tamanho das ondulações, não o das manchas, que sempre preenchem o quadro. A malha cobre o quadro inteiro: `backgroundColor` só aparece com `intensity` abaixo de 1, onde uma cor tem alpha abaixo de 1 e na clareira do `centerFade`; acima de 1, as cores ficam mais vivas. Grão fino e parado, como no original. |

- `speed` (0–3, padrão `1`): ritmo do movimento. `1` é o ritmo calmo de base de cada experimento e `0` deixa a imagem parada. O ritmo se mantém ao mudar `durationSeconds`; como o ciclo precisa fechar, alguns movimentos arredondam para voltas inteiras, e ciclos muito curtos (poucos segundos) andam mais rápido que o pedido.
- `scale` (0,5–2, padrão `1`): tamanho das formas (dobras, gotas, células, morros, nuvens). Estrelas e espessuras de linha ficam em pixels.
- `intensity` (0–2, padrão `1`): brilho e cobertura da camada do experimento sobre a cor de fundo; `0` deixa só o fundo.
- `centerFade` (0–1, padrão `0.5`): abre uma clareira arredondada no centro, em direção à cor de fundo, para título, câmera e jogo; os cantos da área de conteúdo ficam mais da metade cobertos. No WebM transparente, o centro fica transparente.
- `colors` (2 a 6): cada experimento distribui a paleta do seu jeito (veja a tabela); o alpha de cada cor reduz a cobertura das partes pintadas com ela.
- `seed`: muda o arranjo (posição das cortinas, gotas, células, relevo, estrelas), não o ritmo.

O shader recebe somente valores calculados a partir do frame e dos parâmetros; a aleatoriedade usa hashes inteiros, que dão o mesmo resultado em qualquer GPU. O movimento fecha o ciclo com a mesma velocidade na emenda.

Com `transparent: true` e `outputFormat: "webm"`, sobra só a camada do experimento (luz, linhas, gotas, gás), com alpha suave. Em MP4 e GIF, essa mesma camada é composta sobre `backgroundColor`. Os sete primeiros experimentos somam luz: sobre um fundo claro ficam em tons pastel, com menos contraste. A série pastel (`flow`, `orbital`, `neon`, `layers`, `haze`, `eclipse`) foi feita para fundos claros: `backgroundColor` é o tom de base da cena, e sobre um fundo escuro vira uma versão noturna. Em `watercolor`, `backgroundColor` é o papel: em papel claro a tinta só escurece, como aquarela de verdade; onde o pigmento é mais claro que o papel (papel escuro, ou um pigmento claro num papel cinza médio), ele vira aos poucos guache opaco, porque a aquarela pura sumiria ali. Nesse experimento, `centerFade` entre 0,3 e 0,5 combina melhor; em 1 o miolo fica liso, sem a textura do papel. Em `mesh`, a malha é opaca: no WebM transparente só a clareira do `centerFade`, `intensity` abaixo de 1 e o alpha das cores deixam ver o que está atrás; com `centerFade`, escolha um `backgroundColor` próximo da paleta, porque um fundo escuro sob cores claras deixa o miolo turvo.

Remotion Chrome Headless requires the `angle` OpenGL renderer for WebGL2. The official commands select it for `WebGLLoop` and `WutheringWavesLoop`; SVG-only compositions keep the default renderer and their reference antialiasing. In the Studio render dialog, choose `angle` under **OpenGL renderer**. Otherwise, rendering fails with an explanation instead of producing blank frames.

```sh
npm run render:mp4 -- WebGLLoop --props presets/webgl-aurora.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-lava.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-silk.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-caustics.json
npm run render:webm -- WebGLLoop --props presets/webgl-cells.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-contours.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-nebula.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-flow.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-orbital.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-neon.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-layers.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-haze.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-eclipse.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-watercolor.json
npm run render:mp4 -- WebGLLoop --props presets/webgl-mesh.json
npm run render:webm -- WebGLLoop --props presets/webgl-alpha.json
```

## Como o loop funciona

Cada composição usa exclusivamente o frame atual e uma seed. A duração define o período completo de todos os movimentos; funções periódicas mantêm a posição, a aparência e a velocidade contínuas na emenda. Partículas seguem trajetórias contínuas, sem desaparecer e reaparecer dentro da imagem.

Para um ciclo de `N` frames, o estado teórico do frame `N` coincide com o frame `0`. O arquivo contém somente `0…N−1`: incluir novamente o frame `0` no fim criaria uma pequena pausa. Portanto, o último frame visível não precisa ser uma cópia do primeiro; a passagem entre eles precisa corresponder a um avanço normal da animação.

MP4, WebM e MOV contêm um ciclo; ative a repetição no aplicativo que os reproduzir. GIF já inclui repetição infinita. Para durações muito curtas, há poucos frames para representar o movimento; prefira vários segundos para um background suave.

Nos overlays, os efeitos do contorno correm ao longo da linha do meio do traço, um retângulo arredondado de comprimento `P = 2(L − 2r) + 2(A − 2r) + 2πr`, com L e A a largura e a altura dessa linha e r o raio. Três regras mantêm o contorno sem emenda em qualquer tamanho:

- **Voltas inteiras.** O padrão (os traços de `dashes`, os `comets`, a repetição das cores do `gradient`) cabe um número inteiro de vezes no contorno, e o ciclo anda um número inteiro desses períodos, pelo menos um quando `strokeSpeed` é maior que zero. Assim o frame `N` volta a ser o frame `0`, e a velocidade é constante na emenda. A seed desloca a fase do padrão entre 0,2 e 0,8 de período, para que a troca de um traço pelo seguinte nunca caia na emenda do loop; ela nunca move a caixa nem as áreas de texto.
- **Espaçamento em px.** O período é pedido em pixels (`dashLength + gapLength`, `cometSpacing`, `gradientLength`) e ajustado ao mais próximo que fecha o contorno. A quantidade de cometas e de traços sai do tamanho: uma `label-sm` e um `title` do mesmo tema mostram os cometas com o mesmo espaço entre eles e as cores na mesma escala, em vez de esticar o desenho.
- **Velocidade real arredondada e registrada.** Como a distância do ciclo é arredondada para períodos inteiros, a velocidade real difere um pouco da pedida e varia de tamanho para tamanho: no tema neon, os 160 px/s pedidos viram 163,6 px/s no `chat-standard` e 147,7 px/s no `chat-tall`. O terminal, o JSON de posição, o `--dry-run` e o manifesto do pack registram a velocidade real (`motion`). Como nos pontos e no xadrez, um frame não pode avançar mais de 40% do caminho até o próximo traço ou cometa: o schema recusa a combinação e diz o que aumentar, sem reduzir a velocidade por conta própria.

Os preenchimentos seguem o mesmo princípio: pontos, listras, damasco e o giro dos brilhos andam períodos inteiros por ciclo, as brasas renascem um número inteiro de vezes, o gradiente balança uma vez por ciclo, e o reflexo do vidro e os bancos de névoa só saltam enquanto estão fora da área. Pulsos do contorno, do brilho e dos cantos são sempre um número inteiro por ciclo, e os enfeites (asas, chamas, vidros, orvalho, balanço) se mexem em harmônicos inteiros do ciclo.

## Desenvolvimento e validação

```sh
npm run typecheck
npm run lint
npm run test:quick                           # seconds: the core tests, after every step
npm run test:quick -- tests/cobweb.test.ts   # plus the test file of what you are changing
npm test
npm run validate:exports
```

Os testes verificam schemas, arredondamento de duração, presets, determinismo por seed e continuidade do movimento no encontro entre ciclos. Nos overlays, verificam também a tabela de tamanhos (pares, arquivo = caixa + 2·bleed), a geometria do contorno, a periodicidade em vários tamanhos, a 50 e a 60 fps e com durações quebradas, a janela vazia das bordas, o bleed, a legibilidade sobre o texto, os presets de cada tema, os nomes dos arquivos, o JSON de posição e o planejamento dos packs, tudo sem renderizar. Os enfeites têm testes próprios: `tests/ornaments-harness-<conjunto>.test.ts` passa cada conjunto por todos os tamanhos dos três tipos (e os presets dos kits, também como o pack os renderiza), com o motor comum em `tests/helpers/ornament-harness.ts` (o `cobweb` separa as bordas em `-cobweb-border`, para rodar em paralelo); `tests/ornaments.test.ts` cobre as regras do motor; e `tests/ornaments-midnight.test.ts`, `-haunted-mansion`, `-haunted-interior` e `-cobweb` conferem os motivos de cada um contra o fundo de origem (desenhos, cores e ritmos). A validação de exportação gera amostras reais em resolução integral e inspeciona codecs, dimensões, duração/FPS, repetição do GIF, o perfil ProRes 4444 do MOV e o alpha do WebM, do MOV e do PNG.

Essa etapa precisa de FFmpeg e FFprobe completos no `PATH`, ou em `FFMPEG_PATH` e `FFPROBE_PATH`: o FFmpeg embutido no Remotion não tem o muxer `rawvideo`, usado para decodificar o primeiro frame, e a leitura do alpha do WebM precisa do decodificador `libvpx-vp9`.

Nos fundos, são quatro amostras de 0,4 segundo por composição: MP4, WebM opaco, WebM com alpha e GIF. Nos overlays, são WebM, MOV e PNG com alpha e um MP4 composto, no menor e no mais alto tamanho do catálogo de cada tipo. Para validar só uma parte, use `--kind` com `background`, `chat`, `block` ou `border`, e `--only` com um trecho do nome da amostra (`npm run validate:exports -- --kind bloco --only label-sm`). O relatório em `out/.scratch/validation/report.json` (outra pasta com `--out <pasta>`) registra cada arquivo aprovado, incluindo a comparação do primeiro frame decodificado com um PNG novo do Remotion, composto sobre fundos claro e escuro. Para amostras mais longas, use `npm.cmd run validate:exports -- --duration 8`. Para retomar uma verificação interrompida sem repetir os encodes existentes, acrescente `--reuse-existing`: os arquivos presentes serão novamente inspecionados e os ausentes serão renderizados. Após alterar animações ou presets de exportação, execute sem essa opção para gerar arquivos novos.

Um conjunto de enfeites fica em `src/overlays/shared/ornaments/sets/` e segue um contrato que esses testes cobram. `place` escolhe as posições e os tamanhos só a partir do layout e de `ornamentSize`, sem seed nem frame, com o motivo principal primeiro; uma lista vazia vira a recusa com a saída. `build` devolve, a cada frame, a mesma quantidade de elementos planos, cada um dentro do círculo da sua posição (luz incluída), com movimento em harmônicos inteiros do ciclo e luz de no máximo 0,2 sobre o texto. `render` desenha sem `filter` nem modo de mistura. Nenhum motivo passa do bleed nem entra na área de texto ou na janela.

Visual verification is `npm run stills -- <job.json>` (format in `scripts/stills-job.ts`): stills, contact sheets, stream mockups, loop seams, determinism, before/after against a git ref, region stats and `report.json`, in `out/review/<date>-<job>/`. A whole pack is `npm run qa:kit -- <pack>`. Pixels are measured with `npm run stills -- inspect` (region, profile, crop, diff; `--help` lists the definitions), never with a throwaway script.

Para validar uma mudança visual, reproduza pelo menos dois ciclos no Studio. Inspecione especialmente a emenda, as bordas, sombras, cores e a composição sobre fundos claros e escuros quando houver alpha. Durações e seeds diferentes devem manter o loop contínuo.

### Adicionar um asset

1. Escolha o tipo em `src/kinds.ts`: ele define a pasta no Studio, o tamanho e o valor inicial de `transparent`. Um tipo pode ter várias composições (por exemplo, uma borda temática ao lado de `BorderLoop`); um tipo novo precisa da política completa e, se tiver tamanho livre, dos tamanhos em `src/sizes.ts`.
2. Para um fundo, crie o componente em `src/backgrounds/` e estenda `baseBackgroundSchema`. Para um overlay, crie-o em `src/overlays/<tipo>/`, monte o schema com `overlayBaseFields(getSize(<tamanho padrão>))` e os grupos de `src/overlays/shared/fields.ts` (preenchimento, contorno, brilho, halo), e termine com um `superRefine` que chame `refineCanvas`, `refineOutset` e as recusas do tipo, sempre com a saída na mensagem. Medidas decorativas ficam em px fixos.
3. Separe o cálculo visual em uma função pura que receba props, frame e total de frames e devolva uma lista plana de elementos, cada um com `opacity` numérica, listados por lugar para que as trocas não apareçam na emenda. Use `loopPhase` e a seed para movimento periódico e reproduzível, e, no contorno, `fitPeriod` e `lapsFor`; evite relógio, `Math.random()`, animações CSS ou estado acumulado entre frames.
4. Num overlay, escreva também `getLayout(props)`, pura e fonte única da geometria: `canvas`, `box`, `content`, `hole` (bordas), `header` (se houver) e `outset`, que nunca passa do bleed. Acrescente `getMotion` para a velocidade real e, se o asset tiver máscara, `getMask`.
5. No componente, leia `useCurrentFrame()` e `useVideoConfig()`, desenhe o resultado da função e use a mesma regra de fundo das composições existentes (`hasAlpha`; nos overlays, `OverlayCanvas`).
6. Registre a entrada em `src/catalog.tsx` (`backgroundCatalog` ou `overlayCatalog`) com `id`, `kind`, `component`, `schema`, `defaultProps: schema.parse({})` e, nos overlays, `getLayout` e `getMotion`. Em `src/Root.tsx`, adicione a `Composition` dentro do `<Folder name={kindPolicies.<tipo>.folder}>`, com `id="Nome"`, um objeto literal em `defaultProps` para permitir salvar os controles no Studio e, nos overlays, o `calculateMetadata` dos exemplos, que faz o canvas do Studio seguir `width`, `height` e `bleed`. O exporter lê os defaults efetivos da composição e aplica apenas os overrides solicitados.
7. Acrescente presets em `presets/` (nos overlays, `presets/<tipo>-<tema>.json`, sem tamanho fixo, válidos no schema estrito em todos os tamanhos do tipo) e, se for o caso, o item no manifesto do pack; um tema novo entra também em `tests/helpers/themes.ts`: em `CLASSIC_THEMES` se não usa enfeites nem relâmpago, ou em `KIT_THEMES`, com o nome `halloween-<conjunto>`, se usa os enfeites desse conjunto; se o item do painel da Twitch no pack levar `props`, registre-as em `TWITCH_PROPS` de `tests/pack.test.ts`. A lista alimenta os testes de presets, de packs e de loop dos overlays.
8. Inclua a cena nas varreduras genéricas de `tests/backgrounds.test.ts` (determinismo por seed, periodicidade em `N`, velocidade na emenda, com `seamExempt` quando preciso, e valores válidos) e escreva os testes próprios: periodicidade em vários tamanhos e FPS, recusa no limite de velocidade, bleed respeitado, área de texto e janela. `tests/overlay-registry.test.ts` confere a ligação com o Root, os presets, o layout e os nomes. Valide a emenda no Studio e renderize uma amostra nos formatos necessários.

`src/settings.ts` concentra a regra de alpha, os metadados e os presets de exportação; `src/kinds.ts` e `src/sizes.ts`, os tipos e os tamanhos. Mantenha os pacotes Remotion na mesma versão exata e preserve o lockfile para instalações reproduzíveis.
