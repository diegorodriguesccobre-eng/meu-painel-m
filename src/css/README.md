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

A sequência abaixo corresponde aos 20 imports de [src/styles.css](../styles.css),
de cima para baixo. O caminho de cada import parte de `src/styles.css`; os links
da tabela partem deste guia, em `src/css/`, e abrem os arquivos correspondentes.

| Ordem | Caminho no import | Função do arquivo |
| --- | --- | --- |
| 1 | [./css/geral.css](geral.css) | Base do painel: variáveis do tema, tipografia, botões, campos, painéis, diálogos e componentes compartilhados. |
| 2 | [./css/kits/selecao.css](kits/selecao.css) | Estrutura base da seleção de componentes, quantidades, resumos, preços e kits salvos. |
| 3 | [./css/produtos/listagem.css](produtos/listagem.css) | Listagem de produtos, apresentação em telas pequenas e estilos de importação CSV. |
| 4 | [./css/layout/cabecalho.css](layout/cabecalho.css) | Identidade da Conduz Cobre e distribuição do cabeçalho. |
| 5 | [./css/integracoes/mercado-livre.css](integracoes/mercado-livre.css) | Apresentação da consulta de anúncios, categorias e logística do Mercado Livre. |
| 6 | [./css/produtos/cadastro.css](produtos/cadastro.css) | Formulário compacto de produto, blocos de taxas e cotações, ajuda e abas. |
| 7 | [./css/componentes/indicadores.css](componentes/indicadores.css) | Cores de risco, selos, legendas e resumos de lucro. |
| 8 | [./css/componentes/cartoes-preco.css](componentes/cartoes-preco.css) | Cartões compartilhados de marketplace, preço, lucro e composição dos custos. |
| 9 | [./css/produtos/resultados.css](produtos/resultados.css) | Distribuição dos resultados de precificação e adaptações dos cartões e dos kits salvos nas diferentes telas. |
| 10 | [./css/kits/montagem.css](kits/montagem.css) | Editor de kits, largura das colunas, cotação, prévia de preços e adaptação ao espaço disponível. |
| 11 | [./css/ads/campos.css](ads/campos.css) | Campos de percentual de Ads e selo de ROAS equivalente nos formulários de produtos e kits. |
| 12 | [./css/produtos/catalogo.css](produtos/catalogo.css) | Catálogo compacto, busca, ações, apresentação de publicidade e anúncios desativados. |
| 13 | [./css/ads/gestao.css](ads/gestao.css) | Publicidade consultada, resumo, cartões azuis, estimativas, projeções e conciliações. |
| 14 | [./css/ads/historico.css](ads/historico.css) | Comparativo de Ads por períodos, filtros, tabela com rolagem e controles de exportação. |
| 15 | [./css/sincronizacao.css](sincronizacao.css) | Avisos do catálogo compartilhado, revisão de conflitos e apresentação dos relatórios salvos. |
| 16 | [./css/layout/menu.css](layout/menu.css) | Menu lateral, recolhimento no computador, atalhos e navegação no celular. |
| 17 | [./css/produtos/importacao.css](produtos/importacao.css) | Revisão da importação do catálogo do Mercado Livre e anúncios pendentes de cadastro. |
| 18 | [./css/acesso.css](acesso.css) | Tela de entrada, identificação da pessoa e aceites dos documentos. |
| 19 | [./css/produtos/custos-csv.css](produtos/custos-csv.css) | Revisão de custos por SKU, comparação de valores e controles de seleção. |
| 20 | [./css/componentes/utilitarios.css](componentes/utilitarios.css) | Classes de apresentação fixa para ações, rodapé, restauração de backup e notas dos kits. |

As páginas de termos e privacidade incorporam [documentos.css](documentos.css)
em suas próprias montagens, conforme a seção de documentos deste guia.

### Por que preservar a sequência

O build expande os imports nessa ordem e incorpora o resultado ao HTML. A
sequência mantém a cascata validada antes da separação dos arquivos: módulos
posteriores ajustam algumas regras de base. Por isso, arquivos da mesma pasta
nem sempre aparecem juntos; ordenar os imports por nome ou por tela pode mudar
o resultado.

Quando duas declarações aplicáveis têm a mesma prioridade na cascata e a mesma
especificidade, prevalece a que aparece depois. Regras com `!important`, seletores
mais específicos e condições de `@media` ou `@container` também influenciam o
resultado; estar no fim do arquivo não faz uma regra vencer em todos os casos.

Um exemplo existente é `.saved-kits`: `kits/selecao.css` define a grade base
com duas colunas, e `produtos/resultados.css`, carregado depois, redefine essa
grade para uma coluna. As duas declarações usam o mesmo seletor. Inverter esses
imports pode mudar a disposição dos kits no computador mesmo sem editar nenhuma
declaração. As regras para telas menores também devem ser conferidas.

Na manutenção de rotina, preserve a ordem atual. Uma reorganização da sequência
exige revisar as regras que se sobrepõem e conferir Meus produtos, Montar kits e
Gestão de Ads em tamanhos de computador e celular.

### Como incluir um módulo

Ao criar um módulo, inclua seu import relativo em uma linha própria do arquivo
de entrada, escolhendo sua posição em relação à base e às adaptações existentes,
por exemplo:

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
