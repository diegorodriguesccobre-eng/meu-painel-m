# Gestão de Ads e metodologia do painel

Pesquisa e decisões registradas em 13/11/2026 para retomar em outra sessão.
O painel possui uma tela separada **Gestão de Ads**, com resumo do anunciante,
publicidade por produto cadastrado, projeções e conciliação manual de lucro.
As automações de comissões, frete, serviços e atualização de Ads pelo ACOS são mantidas.

## Gestão de Ads (16/11/2026)

### Comparativo por períodos e referências de método

A referência visual enviada pelo usuário orienta a visão em tabela, com data-base,
períodos semanais/quinzenais/mensais, métrica, busca por nome/MLB/SELLER_SKU, conta,
colunas consecutivas e total. Semanas com base em 15/11/2026 mostram 19–25/10,
26/10–01/11, 02–08/11 e 09–15/11: total de 28 dias. Mensal usa três períodos de
30 dias, respeitando os 90 dias retrospectivos documentados pelo Mercado Livre.

O comparativo não altera os percentuais de Ads usados na precificação: esse fluxo
continua com os últimos 30 dias encerrados. Metadados de propriedade/anunciante/grupo
são reutilizados em cada lote de duas publicações; o limite é 38 chamadas externas
por operação, dentro do orçamento Free do Worker. Sem consulta completa, preserva
os dados anteriores e identifica a consulta parcial, sem preencher falhas com zero.

TACOS por anúncio = investimento / faturamento confirmado do próprio item × 100.
O denominador vem de `/orders/search`, com vendedor autenticado, filtro do item,
data de criação da venda entre 00:00:00 e 23:59:59 em São Paulo e paginação completa.
Somamos `order_items.quantity × unit_price` apenas das linhas do anúncio solicitado.
Canceladas e cancelamentos pendentes são excluídos. Valores ficam antes de taxas,
impostos e frete. Não se soma o pedido/pacote inteiro, nem `gross_price` (que pode
representar o preço anterior aos descontos). Reembolso parcial exige conferência
do rateio por item; nesses casos o TACOS fica indisponível.

Correção de metodologia em 16/11/2026: a versão anterior somava `total_amount`
atribuído de Ads com `organic_units_amount`. Essa razão pode corresponder a uma
visão de atribuição, mas mistura receitas indiretas de outros produtos com o orgânico
do item. Não comprova seu faturamento efetivo e não deve ser apresentada como TACOS
apurado do anúncio. A receita orgânica continua disponível apenas como informação.
ACOS e ROAS mantêm suas bases de atribuição oficiais, sem alteração na precificação.
Os totais recalculam razões pelas somas; nunca pela média dos percentuais semanais.

A leitura de pedidos requer a permissão funcional Vendas em Leitura, autorizada
pelo usuário. Sem acesso, paginação completa ou fonte compatível, o painel informa
“sem dados suficientes”, preservando as consultas de Ads e as demais automações.
Somente totais financeiros do item saem do backend; dados pessoais dos compradores
não são enviados ao navegador nem guardados no backup. A leitura não permite criar,
alterar ou cancelar pedidos. Fontes: [Orders](https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas)
e [definição de TACOS do Mercado Livre](https://www.mercadolivre.com.br/ajuda/43068).

Por padrão, o azul continua seguindo o lucro estimado, como solicitado originalmente.
Há escolha de lucro conciliado ou intensidade da métrica selecionada. Nesse último
modo, maior investimento dá maior intensidade, sem significar mais lucro. As setas
comparam o valor observado da métrica com o período anterior; não são recomendações.
As escalas e regras de tendência são próprias e transparentes.

Foram consideradas fontes públicas dos fornecedores, sem alegar reprodução de
algoritmos proprietários:

- [Letzee — ACOS, ROAS e TACOS](https://letzee.ai/fim-do-acos-no-mercado-livre-entenda-a-mudanca-para-roas-tabela-de-conversao-acos-x-roas/):
  fórmulas de custo/retorno e avaliação da margem após despesas. Não há regra pública
  identificada para os limiares/intensidade do BLUE.
- [AdMan — Glossário](https://ajuda.ad-man.io/hc/centro-de-ajuda/articles/1761142786-glossario-de-metricas)
  e [Rentabilidade](https://ajuda.ad-man.io/hc/centro-de-ajuda/articles/1787157957-rentabilidade-na-adman):
  separar eficiência Ads, receita orgânica e margem após despesas/ajustes. O artigo
  antigo ACOS/TACOS menciona 30 dias como janela; o painel conserva 14 dias de
  atribuição conforme a documentação atual do ML, distinguindo janela de análise.
- [Mercado Turbo — Funcionalidades](https://www.mercadoturbo.com.br/funcionalidades/):
  referência de gestão/lucratividade e conciliação. Não foram localizadas fórmulas
  públicas suficientes para afirmar igualdade com seu cálculo interno.

O backup v17 preserva o comparativo, receitas orgânicas, SKUs e conciliações por
período. O total apurado pode usar conciliação própria do intervalo ou somar todos
os períodos conciliados com o mesmo escopo; uma parte faltante não vira lucro zero.
CSV exporta os resultados filtrados. Snapshots anteriores continuam aceitos.

- O total do anunciante percorre todas as páginas de `campaigns/search` v2 e soma
  `results[].metrics`, deduplicando `results[].id`. Não usa `metrics_summary` como
  total global: a validação real mostrou resumo limitado à página. Havendo vários
  anunciantes acessíveis, o usuário escolhe um deles;
  contas delegadas não são somadas automaticamente. Este total inclui produtos
  fora do catálogo. O resumo dos cadastrados tem escopo próprio, sem duplicar
  anúncios vinculados a mais de um cadastro e sem misturar contas ou períodos.
- Por anúncio, são guardados receita, vendas e unidades diretas e indiretas,
  separadamente. Vendas indiretas podem corresponder a outros produtos; os custos
  do produto anunciado não são aplicados a elas. Resultados recentes são
  identificados como atualizáveis pela janela de atribuição de 14 dias.
- Métricas consultadas, previsão e lucro apurado ficam em blocos distintos.
  Sem atividade, métricas incompletas ou dados antigos sem separação das receitas,
  a estimativa mostra “Sem dados suficientes”. Gasto zero só é apresentado quando
  retornado por uma consulta válida; não é adotado como hipótese de publicidade grátis.
- A estimativa do lucro usa receita direta, unidades diretas e custos atuais do
  cadastro. CPV, adicionais e frete de referência são multiplicados pelas unidades.
  Imposto e tarifa efetiva de referência são proporcionais à receita direta.
  Todo o gasto do anúncio é descontado uma vez, das diretas. É uma aproximação:
  preços históricos, pedidos com várias unidades e custos efetivos podem divergir.
- Para lucro apurado, o usuário concilia os totais efetivos: receita após ajustes,
  custo dos produtos vendidos, tarifas, impostos, frete e outras despesas. Informa
  se incluiu diretas ou diretas e indiretas, fonte e critério de distribuição,
  e confirma a conferência. Fórmula: receita conciliada − despesas conciliadas −
  Ads consultado. O percentual previsto de Ads não é descontado novamente.
  Sem conciliação válida, a apuração permanece “Sem dados suficientes”.
- A conciliação de lucro é manual. A consulta de faturamento para TACOS não apura
  custos efetivos nem substitui essa conciliação. A fonte, o período e a data de conferência são
  guardados. Mudanças na evidência financeira de Ads exigem revisar a conciliação;
  mudanças nos custos atuais não reescrevem despesas históricas já conferidas.
- Projeções de 7, 30 ou 90 dias usam investimento diário editável, CPC e ROAS por
  soma dos valores, e unidades por clique explicitamente calculadas. Não se usa
  vendas/cliques como se fosse o CVR oficial. Para os cadastrados, mantém-se a
  distribuição histórica do investimento. Não há promessa de retorno, nem edição
  de orçamento/campanhas no Mercado Livre. Sem histórico, retorno não é projetado.
- A intensidade do azul cresce com o lucro em reais na base selecionada: estimativa
  das diretas ou lucro conciliado. Receita e ROAS não determinam a cor. Prejuízo
  tem azul discreto; falta de dados tem fundo neutro.
- O backup v17 guarda métricas detalhadas, resumo do anunciante e conciliações.
  Backups v1–v16 continuam aceitos. Snapshots antigos não ganham receitas ou unidades
  inventadas: uma nova consulta é necessária. A hospedagem continua no plano Free.

## Consulta real de Product Ads

Com a conta conectada, o painel consulta automaticamente os últimos 30 dias
encerrados no fuso de São Paulo, ao abrir a página e ao salvar um produto
vinculado. Uma consulta válida é reutilizada por dez minutos; o botão
“Atualizar Ads · 30 dias” força uma atualização. O período fica no cartão da
modalidade do anúncio vinculado. Os cartões de modalidades hipotéticas continuam
com ROAS equivalente, para não duplicar o investimento como se fossem campanhas
distintas. A Shopee não possui conexão com a conta nesta etapa.

O ACOS real é investimento / receita atribuída × 100. Por decisão do usuário,
atualiza Ads Mercado Livre (%) e recalcula as cotações oficiais existentes, sem
alterar o preço atual do anúncio. O percentual é arredondado para cima em duas
casas, para não reservar menos que o custo observado. O ROAS real é receita
atribuída / investimento, calculado sobre os totais, sem média de percentuais.
Receita atribuída inclui vendas diretas e indiretas; não é o lucro do produto.
O total investido do período é apenas informativo: o lucro por venda desconta
Ads uma única vez, pelo percentual aplicado.

Sem receita, o ACOS não é definido: preservamos o Ads anterior e mostramos um
aviso. ACOS a partir de 100% também é preservado apenas como métrica, pois o
cadastro aceita Ads abaixo de 100%. Sem investimento, ROAS mostra um traço.
Ausência de anúncio publicitário, erros, falta de permissão e páginas incompletas
não zeram o Ads. Falhas de recotação deixam as sugestões desatualizadas explícitas.
O snapshot inclui período, anúncio e vendedor, permanece no navegador e no backup
v16. Backups anteriores continuam aceitos. Respostas de outra conta ou de um
formulário em edição não sobrescrevem o cadastro.

Kits montados usam um anúncio apenas como referência de logística. Isso não
identifica uma campanha própria do kit: seu Ads continua cadastrado manualmente,
sem herdar gastos dos componentes nem do anúncio de referência. Um kit cadastrado
como produto e vinculado ao próprio anúncio pode consultar Product Ads normalmente.

A API é somente leitura: anunciantes v1, busca de Ad Groups por `filters[item_ids]`
e métricas dos anúncios de cada grupo v2. Cada item é verificado como pertencente
à conta antes da consulta; totais de grupos compartilhados não são atribuídos ao
produto. O backend limita lotes e paginação dentro do orçamento Free do Worker.
Não foram adicionados secrets, planos pagos nem operações de edição de campanhas.
O acesso depende da liberação de Product Ads pelo Mercado Livre para a conta e o
aplicativo. Fonte: [Product Ads para Catálogo e User Products][api].

## Campo Ads no cadastro

Ads é uma reserva percentual sobre o preço de venda. Cada produto e kit guarda
dois percentuais independentes: Ads Mercado Livre (%) vale para Clássico e
Premium; Ads Shopee (%) vale somente para a Shopee. O Ads único de cadastros
anteriores é mantido como valor inicial dos dois campos, preservando preços,
lucros e cotações. Registros sem Ads equivalem a 0%. O percentual de cada
marketplace incide uma vez sobre a venda do kit, sem somar Ads dos componentes.

Alterar somente Ads Shopee não invalida nem dispara uma nova consulta do
Mercado Livre. A API de precificação do ML continua recebendo o parâmetro
`ads`, preenchido exclusivamente com Ads Mercado Livre. O CSV exporta os dois
percentuais, e o backup v17 preserva os campos separados e aceita versões
anteriores.

Cada campo de Ads apresenta um selo de ROAS equivalente, calculado como
100 dividido pelo percentual informado. Ads de 6% exibe ROAS de 16,7x; com
zero ou entrada inválida, o selo mostra um traço. Esse valor é uma referência
da reserva de publicidade, e não uma métrica apurada da conta ou campanha.
Ads (%) e ROAS equivalente também são apresentados nos cartões de cada
marketplace em Meus produtos e nos kits salvos, usando os percentuais do cadastro.

O preço sugerido busca preservar a margem desejada após Ads. Para produtos com
preço atual vinculado ao Mercado Livre, esse preço é preservado e o lucro passa
a descontar a reserva de publicidade. Os status usam o lucro calculado sobre
o preço: abaixo de 10% é baixo; de 10% a menos de 15%, em risco; a partir de 15%,
seguro. O preço de referência para 10% também considera Ads.

Na Shopee e nos kits montados, o campo continua manual. A integração Product Ads
consulta gastos, mas não configura campanhas. A pesquisa de ACOS, CPC e ROAS
abaixo é a base para os próximos relatórios de estatísticas.

## Definições oficiais

Product Ads é cobrado por clique. CPC médio é o investimento dividido pelo
número de cliques. ACOS é o investimento dividido pela receita atribuída aos
anúncios, multiplicado por 100. ROAS é essa receita dividida pelo investimento.
Mantendo o mesmo período, moeda e conjunto de receitas, ACOS (%) = 100 / ROAS.
ROAS mede receita, não lucro. Fontes: [cobrança e orçamento][orcamento],
[métricas de Product Ads][metricas] e [API de Product Ads][api].

A receita atribuída pode incluir vendas diretas e indiretas. Uma venda indireta
pode ser de outro produto da loja; ela não permite atribuir automaticamente
todo o lucro ao produto que recebeu o clique. A documentação informa janela
de atribuição de 14 dias; resultados recentes podem receber novas atribuições.
Fonte: [documentação da API][api].

## Regras para uma futura implementação

- Descontar o gasto publicitário uma vez. CPC, ACOS e ROAS descrevem o mesmo
  investimento e não devem ser somados como três taxas.
- Separar previsão de publicidade de resultado apurado. ROAS objetivo e ACOS
  estimado não garantem o desempenho futuro.
- Consultar métricas de anúncio, Ad Group e campanha pelos recursos atuais da
  API. Verificar novamente documentação, disponibilidade e permissões quando
  essa etapa for autorizada; a conexão de catálogo não garante acesso a Ads.
- Guardar período, origem, moeda, nível de agrupamento e data da consulta.
  Calcular CPC, ACOS e ROAS agregados pela soma dos gastos, cliques e receitas,
  evitando média simples dos percentuais diários.
- Distinguir receita publicitária e receita total. ACOS usa receita atribuída
  aos anúncios; distribuir o gasto entre vendas orgânicas e patrocinadas requer
  outro critério explícito, como gasto dividido pela receita total (TACOS).
- Distinguir vendas e unidades. Um carrinho pode conter várias unidades, e
  conversões indiretas podem envolver produtos diferentes. Não presumir custo
  por unidade apenas a partir da quantidade de vendas da campanha.
- Tratar gasto com receita zero, ausência de cliques e dados ausentes de forma
  explícita. Não interpretar ausência de histórico como publicidade gratuita.
- Manter consultas oficiais de comissão e frete para cada preço proposto,
  pois publicidade pode levar o preço a outra faixa de cobrança.
- Preservar a hospedagem no plano gratuito e o caráter de consulta da integração.
  Não criar, ativar ou editar campanhas por consequência destas notas.

Essas regras de aplicação ao painel são propostas de projeto. As definições das
métricas e a atribuição seguem as fontes oficiais indicadas.

## Exemplo numérico para retomar

Hipótese: 500 cliques, gasto de R$300 e 25 compras de uma unidade do mesmo produto
a R$200. Receita atribuída de R$5.000: CPC médio de R$0,60; conversão de 5%;
publicidade de R$12 por unidade; ACOS de 6%; ROAS de aproximadamente 16,67x.

Com custo de R$100, frete de R$20, comissão de 14%, imposto de 6% e sem outras
despesas, o lucro por venda de R$200 é R$28 (14%, em risco) após Ads.

Para buscar 20% de lucro, mantendo ACOS estimado em 6%, a fórmula simplificada
é 120 / (1 - 0,14 - 0,06 - 0,20 - 0,06), resultando em R$222,23 arredondados para
cima. Mantendo, em vez disso, CPC e conversão constantes, o Ads por unidade
fica em R$12 e o preço seria R$220. São hipóteses distintas; ao alterar o preço,
o desempenho e as tarifas podem mudar.

## Referência visual pesquisada

[Calculadora Onicanal](https://calculadoraonicanal.netlify.app/): o campo
Custo Marketing / Ads (%) reserva um percentual do preço e aumenta a sugestão
para preservar a margem. Esse comportamento foi observado com entradas
sintéticas; as regras da referência não substituem a documentação dos marketplaces.

[orcamento]: https://vendedores.mercadolivre.com.br/aprender/nota/orcamento-em-publicidade-o-que-voce-precisa-saber-para-comecar
[metricas]: https://vendedores.mercadolivre.com.br/aprender/nota/o-que-as-metricas-no-administrador-significam?guideKeyId=GE18
[api]: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/product-ads-para-catalogo-e-user-products-leitura

## TACOS: descontos e situação financeira dos pedidos — 24/11/2026

A consulta usa dados oficiais de `/orders/search`, `/orders/{id}`,
`/orders/{id}/discounts` e, quando há envio, `/shipments/{id}`. Não acessa
pagamentos por outro domínio nem modifica pedidos, anúncios ou campanhas.

- O preço unitário do pedido já pode incorporar descontos. `gross_price` é o
  valor total antes dos descontos, sem multiplicá-lo novamente pela quantidade.
  Os detalhes oficiais de cupons são conciliados com o desconto já incorporado.
  Sem informação suficiente para evitar dupla dedução, o TACOS fica pendente.
- Descontos são associados ao ID do item pelo recurso oficial. Não se aplica
  desconto fixo de 5%, nem o rateio estimado usado na investigação das planilhas.
  Cashback e bônus financeiros não são abatidos do preço do produto para TACOS.
- Canceladas e cancelamentos pendentes de restituição não entram na receita.
  Um reembolso integral confirmado nos pagamentos exclui a receita do produto,
  sem subtrair o repasse líquido depois de tarifas. Retorno físico não comprova
  restituição financeira.
- Reembolso parcial é deduzido automaticamente somente quando todos os itens
  são do mesmo anúncio, o pagamento corresponde exatamente ao valor dos produtos,
  o valor bruto reembolsado está informado e não há frete ou parcelamento.
  Reembolso sem alocação inequívoca ao produto deixa o TACOS sem dados suficientes.
- Não entregue com pagamento aprovado continua na receita, inclusive com envio
  cancelado/devolvido sem reembolso confirmado. Pagamentos ausentes, inconsistentes
  ou mistos sem alocação ficam pendentes. A falha de consulta logística é informada,
  sem inventar estorno nem confundir essa falha com falta de dados financeiros.

O navegador completa páginas de até dez pedidos em requisições independentes,
conferindo total, sequência e duplicações antes de aceitar a soma final. Cada
requisição fica abaixo do orçamento de subrequisições do Worker gratuito. Consultas
interrompidas não geram totais parciais apresentados como completos.

A fonte de vendas passa para `mercado-livre-orders-v2`. Backups v17 continuam
legíveis; as bases anteriores precisam de atualização para receber TACOS pela
nova regra. CSV e detalhes da célula preservam descontos, reembolsos e pendências.
A consulta e a aplicação do ACOS de 30 dias, ROAS, precificação, frete e comissões
não mudam. Nenhum relatório financeiro privado da investigação entra no GitHub.

Referências oficiais:
- https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas
- https://developers.mercadolivre.com.br/pt_br/convivencia-me1-me2/gerenciamento-de-vendas
- https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-envios