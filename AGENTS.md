# Background Creator

Projeto local Remotion, React e TypeScript para backgrounds animados em loop, em 1920×1080.

- `src/settings.ts`: parâmetros compartilhados, duração/FPS e presets de exportação.
- `src/`: catálogo e composições; `scripts/`: exportação e validação dos arquivos.
- `presets/`: parâmetros JSON prontos; `tests/`: testes de determinismo, periodicidade e configuração.
- Instalação: `npm ci`. Preview: `npm run studio`.
- Verificação: `npm run typecheck`, `npm run lint`, `npm test` e `npm run validate:exports`.
- Exportação: `npm run render:webm -- ParticleLoop --props presets/particles-alpha.json` (ou `render:mp4` / `render:gif`).

Mantenha todos os pacotes Remotion na mesma versão exata e atualize o lockfile junto às dependências. Animações devem depender exclusivamente do frame e dos parâmetros; use seed para aleatoriedade, nunca relógio, `Math.random()`, CSS animation ou transições CSS. O estado em `N` deve coincidir com o frame `0`, mas exporte somente `0…N−1`. Preserve também a velocidade na emenda do loop.

Preview e render oficial devem compartilhar schema, duração e regra de alpha. MP4/GIF compõem sobre `backgroundColor`; somente WebM pode preservar transparência. Não reduza resolução, FPS ou qualidade automaticamente. Documentação e mensagens voltadas ao usuário em português.
