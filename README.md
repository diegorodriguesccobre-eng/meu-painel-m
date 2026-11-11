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

## Testar e preparar a publicação localmente

Com Node.js 24 instalado:

```sh
npm test
npm run build
```

Não há dependências externas. Os testes verificam cálculos, frete, modalidades, adicionais,
kits, CSV, backup e eventos com DOM simulado. Eles não substituem testes visuais em navegador
ou em um celular físico. O resultado detalhado em `resultados-testes.json` é gerado localmente
e não é versionado.

## Registrar alterações

Edite o `index.html` da raiz, execute os testes e registre suas alterações em commits.
A pasta `dist` é gerada pelo build e não precisa ser enviada ao GitHub.
