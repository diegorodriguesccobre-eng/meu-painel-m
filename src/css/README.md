# Organização do CSS

Edite os estilos nesta pasta. [src/styles.css](../styles.css) é a entrada que
reúne os módulos do painel na ordem em que são aplicados. O build expande os
imports locais e incorpora o CSS ao HTML final, junto do JavaScript. O navegador
não precisa carregar arquivos CSS adicionais na versão publicada.

Este guia detalha a [organização dos arquivos no README principal](../../README.md#organização-dos-arquivos-e-do-css).
Os links abaixo são relativos a `src/css/` e abrem os respectivos fontes no GitHub.

## Onde editar os estilos

| Área | Arquivos para editar | O que controlam |
| --- | --- | --- |
| Estilos gerais | [geral.css](geral.css) | Variáveis de cor do tema, tipografia, botões, campos, painéis, diálogos e regras base compartilhadas. |
| Meus produtos | [listagem.css](produtos/listagem.css), [resultados.css](produtos/resultados.css) e [cadastro.css](produtos/cadastro.css) | Lista, busca, ordenação, distribuição dos resultados e cadastro compacto com suas abas no celular. |
| Catálogo, pendências e CSV | [catalogo.css](produtos/catalogo.css), [importacao.css](produtos/importacao.css) e [custos-csv.css](produtos/custos-csv.css) | Anúncios pendentes, revisão de importação e comparação de custos por SKU. |
| Montar kits | [montagem.css](kits/montagem.css) e [selecao.css](kits/selecao.css) | Largura das colunas, campos da montagem, seleção e quantidades dos componentes, prévia de preços, kits salvos e abas no celular. |
| Gestão de Ads | [gestao.css](ads/gestao.css) e [historico.css](ads/historico.css) | Resumo, cartões azuis, projeções e conciliações; filtros, comparativo por períodos e tabela com rolagem horizontal. |
| Campos de Ads e ROAS | [campos.css](ads/campos.css) | Apresentação do percentual de Ads e do ROAS equivalente nos formulários de produtos e kits. |
| Componentes compartilhados | [cartoes-preco.css](componentes/cartoes-preco.css), [indicadores.css](componentes/indicadores.css) e [utilitarios.css](componentes/utilitarios.css) | Cartões de marketplace, selos, lucros, status e classes de apresentação reutilizadas entre telas. |
| Cabeçalho e navegação | [cabecalho.css](layout/cabecalho.css) e [menu.css](layout/menu.css) | Marca, cabeçalho e menu lateral, incluindo recolhimento no computador e abertura no celular. |
| Integração e sincronização | [mercado-livre.css](integracoes/mercado-livre.css) e [sincronizacao.css](sincronizacao.css) | Apresentação das consultas do Mercado Livre, avisos do catálogo compartilhado e revisão de conflitos. |
| Entrada e documentos | [acesso.css](acesso.css) e [documentos.css](documentos.css) | Tela de entrada e aceites; aparência compartilhada pelos termos de uso e pela política de privacidade. |

## Como escolher o arquivo

- Para mudar o fundo e a fonte do painel inteiro, comece por `geral.css`.
- Para ajustar a lista ou os resultados de Meus produtos, confira
  `produtos/listagem.css` e `produtos/resultados.css`. O formulário de novo produto
  e suas abas ficam em `produtos/cadastro.css`.
- Para ajustar a largura de “Monte seu kit”, use `kits/montagem.css`. A seleção
  dos componentes e suas quantidades também tem regras em `kits/selecao.css`.
- Para alterar o comparativo semanal de Ads, use `ads/historico.css`. Resumo,
  cartões, projeções e conciliações ficam em `ads/gestao.css`.
- Se a mudança for em um cartão de marketplace usado por produtos e kits,
  confira `componentes/cartoes-preco.css` e as adaptações da tela correspondente.
  Uma mudança compartilhada deve ser conferida nas duas telas.

## Ordem dos imports

Preserve a ordem dos módulos em [src/styles.css](../styles.css): regras
posteriores podem ajustar componentes definidos antes. Reordenar os imports pode
mudar o visual mesmo sem alterar as declarações de CSS.

Ao criar um módulo, inclua seu import relativo em uma linha própria do arquivo
de entrada, por exemplo:

```css
@import "./css/componentes/novo-componente.css";
```

Esse caminho parte de `src/styles.css`. Use imports relativos de arquivos `.css`
dentro de `src/`. A montagem rejeita imports circulares, caminhos fora dos fontes
e formatos não suportados. As regras ficam no módulo correspondente; o arquivo
de entrada reúne os imports.

## Adaptação ao computador e ao celular

Mantenha as regras `@media` e `@container` junto dos estilos do componente, no
mesmo arquivo. Assim, um ajuste da tela pode ser conferido junto de suas versões
para computador e celular.

Verifique também os módulos compartilhados: a aparência de um cartão de preço,
por exemplo, pode receber adaptações em `produtos/resultados.css` e
`kits/montagem.css`. Evite adicionar uma regra geral quando o ajuste pertence
somente a uma tela.

## Estilos fixos e valores dinâmicos

Use classes para apresentação fixa. Os valores de `--ads-strength` e
`--cell-blue` continuam definidos por item porque a intensidade do azul depende
das métricas de Ads. As regras visuais que utilizam esses valores ficam nos
módulos de publicidade. Alterações de aparência devem preservar essa ligação
com os dados.

## Termos de uso e política de privacidade

Os documentos usam [documentos.css](documentos.css), sem importar os estilos do
painel. Edite esse arquivo para mudar os dois documentos de maneira consistente;
seus templates ficam em [src/termos.html](../termos.html) e
[src/privacidade.html](../privacidade.html). O CSS também é incorporado às páginas
durante a montagem.

## Build e conferência visual

Na raiz do projeto, com Node.js 24 instalado, execute após mudar os estilos:

```sh
npm run build
```

O comando executa os testes antes de gerar o `index.html` da raiz e os arquivos
de `dist/`. Faça as alterações nos fontes: não edite diretamente esses arquivos
gerados, pois a próxima montagem substitui seu conteúdo. A pasta `dist/` não
precisa ser enviada ao GitHub. Veja também [como registrar alterações](../../README.md#registrar-alterações).

O HTML reúne os estilos e scripts em um arquivo, mas o login, o catálogo
compartilhado e as consultas da versão atual exigem o site hospedado e uma sessão
válida.

Depois de alterar CSS, confira Meus produtos, Montar kits e Gestão de Ads em
tamanhos de computador e celular, incluindo menu, formulários, cartões e rolagem
das tabelas. Os testes automatizados não substituem essa conferência visual.
Durante a revisão visual, não salve alterações nos cadastros reais.
