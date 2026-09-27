# Background Creator

Projeto local Remotion, React e TypeScript para backgrounds animados em loop (1920×1080) e overlays de live (chat, blocos de texto, bordas) com transparência, vendidos em packs.

- `src/settings.ts`: parâmetros compartilhados, duração/FPS, regra de alpha e presets de exportação.
- `src/kinds.ts`: tipos de asset (pasta no Studio, tamanho, alpha padrão); `src/sizes.ts`: tamanhos nomeados.
- `src/`: catálogo e composições; `src/overlays/`: ChatLoop, BlocoLoop, BordaLoop e o motor comum em `shared/` (enfeites temáticos em `shared/ornaments/`, um conjunto por nome em `sets/` (`<nome>.tsx` e auxiliares `<nome>-*.ts(x)`)).
- `scripts/`: exportação, validação e o builder de packs (`scripts/pack.ts`); `packs/`: manifestos por tema.
- `presets/`: parâmetros JSON prontos; `tests/`: testes de determinismo, periodicidade e configuração.
- Instalação: `npm ci`. Preview: `npm run studio`.
- Verificação: `npm run typecheck`, `npm run lint`, `npm test` e `npm run validate:exports` (FFmpeg/FFprobe completos).
- Exportação: `npm run render:webm -- ParticleLoop --props presets/particles-alpha.json` (ou `render:mp4` / `render:gif` / `render:mov` / `render:png`); overlays com `--size <id>` ou `--width/--height/--bleed`.
- Packs: `npm run render:pack -- <tema> --dry-run` (sem `--dry-run` renderiza; `--only`, `--overwrite`). Itens aceitam `variant` (sufixo do arquivo) e `bleed` próprio acima do tamanho nomeado; os kits de Halloween saem com e sem enfeites.

Mantenha todos os pacotes Remotion na mesma versão exata e atualize o lockfile junto às dependências. Animações devem depender exclusivamente do frame e dos parâmetros; use seed para aleatoriedade, nunca relógio, `Math.random()`, CSS animation ou transições CSS. O estado em `N` deve coincidir com o frame `0`, mas exporte somente `0…N−1`. Preserve também a velocidade na emenda do loop.

Preview e render oficial devem compartilhar schema, duração e regra de alpha. MP4/GIF compõem sobre `backgroundColor`; WebM, MOV (ProRes 4444) e PNG preservam transparência. Largura, altura e bleed são sempre pares. Não reduza resolução, FPS ou qualidade automaticamente; recuse combinações inválidas com mensagem que indique a saída. Documentação e mensagens voltadas ao usuário em português.

Overlays: medidas decorativas em px fixos (não escalam com a caixa; exceções: o período do gradiente e a largura do reflexo do vidro acompanham a área, com a velocidade igual em todo tamanho); tudo o que sai da caixa cabe no bleed; a janela da borda fica sempre transparente (exceto a máscara `mascara: true`, que é a própria janela opaca para o OBS); movimento no contorno em voltas inteiras, com período em px. Enfeites (`ornaments`): cada motivo tem tamanho fixo em px (`ornamentSize`), limitado ao espaço livre do seu lugar (bleed, bolsões do padding, faixa), como o `radius` é limitado à metade do lado; o limite não depende do frame nem da seed. `ornamentScale` amplia todos os enfeites juntos (tamanhos, tetos, traços), medindo o espaço livre na mesma escala; em 1 nada muda. Motivo secundário que não cabe no seu mínimo fica de fora; se nem o principal couber, a combinação é recusada com a saída. Enfeites nunca cobrem a área de texto nem a janela, e o que sai da caixa cabe no bleed.
