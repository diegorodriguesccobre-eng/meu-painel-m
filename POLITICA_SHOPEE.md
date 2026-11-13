# Política de precificação Shopee — CNPJ

Conferida em **13/11/2026**, diretamente nas páginas públicas da Central do Vendedor, incluindo a tabela publicada como imagem. A Conduz Cobre confirmou que opera com CNPJ. Não há conexão com a conta Shopee, nem leitura automática da participação em programas.

## Comissão e parcela fixa

Fonte: [Política de Comissão para CNPJ e CPF](https://seller.shopee.com.br/edu/article/26839), complementada pela [Política de Comissão](https://seller.shopee.com.br/edu/article/18483). A alteração da primeira parcela fixa vigora desde 01/10/2026.

| Preço por item | Comissão base | Parcela fixa por item |
|---|---:|---:|
| Abaixo de R$ 9 | 20% | Metade do preço |
| R$ 9 a R$ 79,99 | 20% | R$ 4,50 |
| R$ 80 a R$ 99,99 | 14% | R$ 16 |
| R$ 100 a R$ 199,99 | 14% | R$ 20 |
| A partir de R$ 200 | 14% | R$ 26 |

A taxa de transação já está incluída. O subsídio Pix concedido pela plataforma não é descontado novamente do recebimento simulado do vendedor. O preço sugerido deve ser validado na própria faixa: atravessar um limite pode mudar a parcela fixa e a comissão.

## Programas opcionais

- [Devolução Fácil](https://seller.shopee.com.br/edu/article/26700): R$ 0,49 por pedido com pagamento confirmado durante a participação cobrada. A documentação descreve teste inicial gratuito de 30 dias. A caixa do painel deve representar cobrança ativa, sem presumir a inscrição da conta.
- [Campanhas de Destaque](https://seller.shopee.com.br/edu/article/18712): adicional padrão de 5% sobre as vendas da loja durante a participação. Não é limitado aos produtos nomeados. Campanhas especiais podem ter condições próprias. O campo existente “Eventos Oficiais” representa esse programa padrão, e a marcação permanece sob controle do usuário.

A simulação considera **um item ou um kit anunciado por pedido**. A parcela fixa incide uma vez no kit anunciado; a Devolução Fácil também entra uma vez no pedido, sem multiplicação pelo número de componentes.

## Imposto

O imposto da empresa não é uma tarifa da Shopee. O percentual cadastrado é preservado; CNPJ não identifica uma alíquota única. Os [termos de logística, item 2.7](https://help.shopee.com.br/portal/4/article/124091) tratam as obrigações tributárias como responsabilidade do vendedor. Não são presumidos regime, NCM, UF ou alíquota fiscal.

## Aplicação e preservação

Os campos existentes mostram automaticamente comissão, parcela fixa e valores dos dois programas. As caixas não são marcadas nem desmarcadas pela automação. Produtos novos, importações, novos exemplos e kits usam a política atual. Abrir um produto para editar prepara os valores atuais, mas só salvar substitui a configuração daquele produto.

Cada cadastro guarda a identificação `cnpj-2026-10-01-checked-2026-11-13`. Registros legados conservam as tarifas manuais anteriores. O backup v12 preserva a política e continua aceitando versões 1 a 11; o CSV identifica a origem.

O simulador arredonda a comissão para centavos e procura o menor preço em centavos que atinge a margem desejada em todas as faixas. Esse critério pode acrescentar um centavo em relação a calculadoras que só arredondam o preço final. Não constitui consulta ao extrato de um pedido real. As regras são embarcadas no HTML e funcionam offline; uma futura mudança de política exige nova conferência e atualização do código.
