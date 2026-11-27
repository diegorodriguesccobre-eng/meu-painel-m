# Organização do CSS

Edite os estilos nesta pasta. `../styles.css` é o ponto de entrada do painel e
define a ordem dos módulos. O build expande os imports locais e incorpora o CSS
ao HTML final, preservando o funcionamento em arquivo único.

| Arquivo ou pasta | Responsabilidade |
| --- | --- |
| `geral.css` | Cores do tema, tipografia, controles, painéis, diálogos e regras base compartilhadas. |
| `componentes/` | Indicadores de lucro, cartões de preço e utilitários de apresentação. |
| `produtos/` | Listagem, cadastro, resultados, catálogo, pendências, importação e revisão de custos por CSV. |
| `kits/` | Seleção dos componentes e montagem com prévia de preços. |
| `ads/` | Campos de Ads, gestão da publicidade e histórico por períodos. |
| `layout/` | Cabeçalho e menu lateral no computador e no celular. |
| `integracoes/` | Apresentação da consulta de anúncios, categorias e logística do Mercado Livre. |
| `sincronizacao.css` | Estado do catálogo compartilhado e revisão de conflitos. |
| `acesso.css` | Entrada, identificação e aceites dos documentos. |
| `documentos.css` | Aparência compartilhada pelos termos de uso e pela política de privacidade. |

## Onde colocar uma regra

- Use `geral.css` para variáveis do tema e regras base que atendem ao painel inteiro.
- Coloque estilos de uma tela ou componente no módulo correspondente. Mantenha
  suas regras `@media` e `@container` no mesmo arquivo.
- Ao criar um módulo, inclua um import relativo em `../styles.css`, em uma linha
  própria: `@import "./css/componentes/novo-componente.css";`.
- Preserve a ordem dos imports: há componentes compartilhados que recebem
  adaptações nas telas. Reordenar os módulos pode alterar a cascata.
- Use classes para apresentação fixa. Os valores de `--ads-strength` e
  `--cell-blue` continuam definidos por item porque dependem das métricas de Ads;
  as regras visuais que os utilizam ficam nos módulos de publicidade.

Os documentos usam seu próprio CSS, sem importar os estilos do painel. Edite
`documentos.css` para mudar os dois documentos de maneira consistente; seus
templates ficam em `../termos.html` e `../privacidade.html`.

Execute `npm run build` após as alterações. Ele valida o painel e atualiza o
`index.html` da raiz e os arquivos de `dist/`. Esses arquivos são gerados; faça
as alterações nos fontes.
