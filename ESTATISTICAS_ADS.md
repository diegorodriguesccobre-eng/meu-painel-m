# Publicidade e estatísticas futuras do painel

Pesquisa e decisões registradas em 13/11/2026 para retomar em outra sessão.
O painel já consulta Product Ads para os anúncios vinculados aos produtos.
Relatórios completos de campanhas e estatísticas históricas continuam como etapa
futura. As automações de comissões, frete e serviços são mantidas.

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
v15. Backups anteriores continuam aceitos. Respostas de outra conta ou de um
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
percentuais, e o backup v15 preserva os campos separados e aceita versões
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
