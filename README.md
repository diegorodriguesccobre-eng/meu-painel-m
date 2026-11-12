# Conduz Cobre — Painel de precificação

Painel da Conduz Cobre, em português, para precificar produtos e kits no Mercado Livre e na Shopee.
Funciona no computador e no celular, com dados salvos no navegador, sem login ou backend.

## Usar no computador

Abra `index.html` no Chrome, Edge ou outro navegador moderno. Não é necessário instalar nada.
A logo fornecida da Conduz Cobre está incorporada no HTML, sem depender de outro arquivo ou de internet.
As instruções de todas as funções estão em [LEIA-ME.txt](LEIA-ME.txt).

## Recursos

- Cadastro de produtos com custo, peso, categoria, margem, outros custos e frete.
- Comparação de preços no Mercado Livre Clássico, Mercado Livre Premium e Shopee.
- Comissões, taxas fixas, impostos e adicionais configuráveis.
- Cada produto e kit preserva as taxas e os serviços vigentes quando foi cadastrado.
- Duas caixas na área de taxas da Shopee para ativar Devolução Fácil e eventos oficiais.
- Frete específico do Mercado Livre quando o preço sem esse frete ultrapassa R$ 100.
- Preço mínimo para manter 10% de margem; alerta abaixo de 15% de margem desejada.
- Busca, ordenação, tabela no computador e cartões em telas pequenas.
- Importação de produtos por CSV e exportação dos preços calculados.
- Montagem de kits com produtos e quantidades, usando os custos atuais do catálogo.
- Backup completo em JSON, com validação e confirmação antes da restauração.

As taxas iniciais são ilustrativas. Ajuste-as às condições dos seus anúncios.
Devolução Fácil começa em R$ 0,49 por venda e eventos oficiais em 2,50 pontos percentuais,
conforme o modelo solicitado; ambos são editáveis e aplicados quando as caixas dos
serviços integrados estão marcadas. Após salvar as taxas, a configuração vale para
os próximos cadastros de produtos e kits. Os cadastros existentes mantêm suas taxas
e opções originais, mesmo ao editar custo, quantidades ou margem. A tabela, os cartões,
o preço mínimo para 10%, o CSV de produtos e o backup respeitam as taxas guardadas.

Ao abrir esta versão, produtos e kits antigos sem taxas próprias recebem uma cópia das
taxas atuais salvas no navegador. Valores históricos que nunca foram registrados
não podem ser recuperados. O cadastro manual, os exemplos e a importação CSV guardam
as taxas vigentes no momento de incluir cada produto. Ao salvar um kit, ele recebe
sua própria cópia das taxas gerais, independente das taxas dos produtos componentes.
Os custos e pesos dos componentes continuam atualizados pelo catálogo. A restauração
de backups antigos usa as taxas do próprio arquivo para preservar produtos e kits.

## Conectar seu catálogo do Mercado Livre

A integração opcional permite autorizar sua conta, escolher anúncios do seu catálogo
ou consultar por ID/link e vincular os dados a um produto do painel. Importa nome,
categoria, peso disponível, modalidade, foto e preço anunciado de referência. O custo
de compra e a margem são informados por você. Em **Taxas deste produto**, é possível
ajustar comissões, impostos, taxas fixas e serviços sem alterar outros cadastros.

O painel continua funcionando localmente para cadastro manual. A conexão com a API
usa Functions do Netlify e exige um aplicativo do Mercado Livre e variáveis de ambiente.
A consulta é somente de leitura e não altera anúncios no marketplace. Credenciais não
ficam no HTML, no GitHub ou nos backups. A sessão expira em até seis horas.

**Para ativar no endereço publicado, siga [CONFIGURAR_MERCADO_LIVRE.md](CONFIGURAR_MERCADO_LIVRE.md).**
A integração só estará operacional para sua conta após essa configuração e sua autorização.

## Testar e preparar a publicação localmente

Ao vincular um anúncio, **Calcular com tarifas oficiais do Mercado Livre** é ativado.
Informe custo, peso, margem e imposto: o painel consulta o recurso oficial
`/sites/MLB/listing_prices` usando a categoria e a logística do anúncio. Valida a
tarifa no preço sugerido para Clássico, Premium e a referência de margem de 10%.
`sale_fee_amount` já contém a parcela fixa; ela não é somada novamente.

A cotação, seus parâmetros e a data ficam preservados no produto, CSV e backup v9.
Alterar taxas gerais não modifica cotações salvas. Editar custo, peso, margem, imposto
ou frete exige nova consulta; é possível atualizar manualmente pelo botão da cotação.
Sem API disponível, o painel informa o erro e impede salvar uma cotação desatualizada.
Desmarcar a opção permite usar as taxas manuais. Cadastros antigos continuam como estavam.

O peso informado é enviado em gramas. Havendo cotação de frete, o peso faturável retornado pelo Mercado Livre é usado na consulta das tarifas. Confira o peso faturável na sua operação;
o custo final pode variar com a logística, dimensões, promoções e regras do Mercado Livre.
Em mudanças descontínuas de tarifa, o preço para 10% é uma referência validada,
sem garantia de mínimo global. O frete é preenchido automaticamente ao vincular, usando a estimativa oficial do vendedor e os descontos retornados em `coverage.all_country.list_cost`. Com tarifas oficiais, o frete é consultado novamente para cada preço e modalidade. Nunca é usada a tarifa do comprador. Erros de consulta deixam um aviso explícito, sem presumir frete zero. Impostos não são obtidos por esta API. Kits continuam
com suas próprias taxas: a categoria de um kit não pode ser inferida dos componentes.
Fonte: [Custos por vender](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender).

Com Node.js 24 instalado:

```sh
npm test
npm run build
```

Não há dependências externas. Há testes simulados da API e do fluxo OAuth em
`tests/mercadolivre.test.cjs`. Os testes do painel verificam cálculos, frete, modalidades, adicionais,
kits, CSV, backup e eventos com DOM simulado. Eles não substituem testes visuais em navegador
ou em um celular físico. O resultado detalhado em `resultados-testes.json` é gerado localmente
e não é versionado.

## Registrar alterações

Edite o `index.html` da raiz, execute os testes e registre suas alterações em commits.
A pasta `dist` é gerada pelo build e não precisa ser enviada ao GitHub.

O frete automático não usa o antigo limite manual de R$100. Consulta todas as faixas, inclusive quando o comprador paga o envio. Para produtos novos em Full, Coleta ou Agências, simula frete rápido a partir de R$79, de acordo com a [tabela oficial 40538](https://www.mercadolivre.com.br/ajuda/40538). O peso faturável e eventuais condições da conta continuam determinados pela API.

Se o endpoint de frete responder HTTP403, o painel usa os valores da tabela oficial 40538 conferida em 12/11/2026, apenas após verificar reputação verde/MercadoLíder/sem reputação e logística elegível. A interface identifica a estimativa pela tabela, sua data e a ausência de dimensões quando aplicável. Produtos usados, logística não coberta e categorias com tabela específica exigem conferência manual. A tabela é um retrato da data indicada, sem promessa de atualização automática.

Os campos **Comissão Clássica (%)** e **Comissão Premium (%)** permanecem visíveis no cadastro. Ao importar um anúncio, recebem a consulta oficial no preço anunciado; após informar custo e margem, exibem as comissões da cotação para os preços sugeridos. Cada campo informa categoria, preço e data da consulta e fica somente leitura no modo automático. Mudanças que invalidam a cotação removem os valores antigos até a nova consulta. O modo manual recupera os valores anteriores do formulário.
