# Manual do usuário — Conduz Cobre

**Painel de precificação, kits e Gestão de Ads**  
Edição de **24/11/2026**, baseada nas funções disponíveis nesta versão.

[Abrir o painel](https://precificacaoconduz.conduz-cobre.workers.dev/) · [Página do projeto](README.md)

O painel ajuda a definir preços no Mercado Livre e na Shopee, comparar o lucro por venda e acompanhar publicidade do Mercado Livre. Mantém uma cópia no navegador e pode compartilhar produtos e kits na nuvem após a configuração da empresa. A conexão com o Mercado Livre consulta dados do marketplace e também controla o acesso ao catálogo compartilhado; salvar um produto ou simular um orçamento aqui não publica anúncios nem altera campanhas.

## Índice

- [1. Começar e cuidar dos dados](#comecar)
- [2. Conhecer as telas](#telas)
- [3. Cadastrar e editar produtos](#produtos)
- [4. Conectar um anúncio do Mercado Livre](#mercado-livre)
- [5. Entender preços, lucros e cores](#precos)
- [6. Entender tarifas, impostos e frete](#tarifas)
- [7. Montar e manter kits](#kits)
- [8. Importar e exportar CSV](#csv)
- [9. Baixar e restaurar um backup](#backup)
- [10. Usar a Gestão de Ads](#ads)
- [11. Resolver dúvidas e avisos](#duvidas)
- [12. Rotina sugerida](#rotina)
- [13. Fontes e referências](#fontes)

<a id="comecar"></a>

## 1. Começar e cuidar dos dados

### Abrir o painel

No computador ou celular, abra o [endereço publicado](https://precificacaoconduz.conduz-cobre.workers.dev/) em um navegador atualizado. Não há cadastro de usuário do painel.

Para usar a versão em arquivo no computador, abra `index.html` com duplo clique. O arquivo incorpora os estilos, o programa e a logo. O cadastro manual e os cálculos locais funcionam sem conexão com os marketplaces. Consultar catálogo, tarifas, frete e Product Ads exige internet e a integração configurada no endereço publicado.

### Onde ficam os dados

O indicador **Salvo neste navegador** confirma a gravação local. Com o catálogo compartilhado configurado, produtos, kits e suas configurações também ficam na nuvem. Comparativos por períodos, resumos do anunciante e conciliações da Gestão de Ads também são compartilhados com a conta autorizada da empresa.

| Situação | O que acontece com o catálogo |
|---|---|
| Reabrir o mesmo endereço, navegador e perfil | O catálogo salvo continua disponível. |
| Abrir em outro computador, celular, navegador ou perfil | Com compartilhamento ativo, conecte a conta autorizada para carregar o catálogo; no modo local, transfira por backup. |
| Trocar de domínio, como Netlify para Cloudflare | O novo endereço começa com armazenamento separado. |
| Limpar os dados do site ou usar uma sessão privada | A cópia local e alterações ainda não sincronizadas podem ser perdidas; o catálogo já confirmado na nuvem pode ser carregado novamente. |
| Quatro funcionários acessarem o mesmo site | Com o compartilhamento ativo e a conta autorizada conectada, utilizam o mesmo catálogo; sem ele, cada navegador tem sua cópia. |

### Ativar e usar o catálogo da empresa

Após a [configuração do responsável](CONFIGURAR_CATALOGO.md), conecte o Mercado Livre no navegador que contém os cadastros principais. Em **Catálogo da empresa**, clique em **Revisar alterações**. Confira as quantidades e escolha combinar os registros locais ou usar somente a base da empresa. Antes de aplicar a escolha, o painel preserva uma cópia anterior neste navegador.

Nos outros aparelhos, conecte a mesma conta autorizada. O catálogo passa a carregar sem exportação. Mudanças são enviadas automaticamente e a base é conferida periodicamente; **Sincronizar agora** permite solicitar uma conferência. O estado de gravação mostra quando há pendências. Sem conexão, a cópia local é mantida para nova tentativa.

Alterações em produtos diferentes são combinadas. Quando dois usuários editam o mesmo cadastro de formas diferentes, use **Revisar alterações** e escolha a versão que deve permanecer. Confira kits e componentes antes de resolver exclusões. O painel evita aplicar atualizações externas durante uma edição em andamento.

O acesso à nuvem depende da sessão da conta Mercado Livre permitida, sem uma senha nova do painel. Desconectar mantém a cópia local. Relatórios e conciliações de Ads também são sincronizados. Os filtros de visualização continuam individuais. Enquanto aparecer **aguardando configuração**, os cadastros continuam locais.

O backup JSON permanece como cópia independente. No modo local, ele também permite transferir o catálogo entre aparelhos. **Restaurar um backup com compartilhamento ativo pode substituir os cadastros da empresa após a sincronização**; confira o arquivo e combine essa operação com a equipe.

Se aparecer **Dados só nesta sessão**, baixe um backup antes de fechar a página. Veja [como fazer e restaurar backups](#backup).

<a id="telas"></a>

## 2. Conhecer as telas

| Tela | Para que serve |
|---|---|
| **Meus produtos** | Cadastrar, pesquisar, ordenar e comparar os preços e lucros dos produtos; importar CSV, exportar e fazer backup. |
| **Montar kits** | Selecionar produtos e quantidades, calcular o conjunto e guardar kits. |
| **Gestão de Ads** | Consultar investimento e atribuição, comparar períodos, projetar cenários e conciliar lucro. |

No celular, os produtos são apresentados em cartões. O cadastro compacto pode usar as abas **Produto**, **Anúncio**, **Mercado Livre** e **Shopee**. Na montagem de kits, telas menores usam **Montagem** e **Preços**. Alternar essas abas mantém os campos preenchidos. O botão **Ajuda** explica a tela em que você está.

<a id="produtos"></a>

## 3. Cadastrar e editar produtos

### Cadastro manual

1. Em **Meus produtos**, clique em **Novo produto**.
2. Preencha os dados abaixo.
3. Confira as configurações de cada marketplace. O vínculo com um anúncio é opcional.
4. Clique em **Salvar produto**.

| Campo | Como preencher |
|---|---|
| Nome | Um nome que facilite localizar o produto. |
| Categoria | A categoria do produto. No cadastro manual, o texto não faz uma consulta automática de comissão por categoria. |
| Custo do produto | O custo de uma unidade, em reais. |
| Peso | O peso em quilogramas. Exemplo: `0,350` equivale a 350 gramas. Confira o pacote usado no envio. |
| Margem desejada | O percentual de lucro sobre o preço de venda que você quer atingir depois dos custos considerados. |
| Ads Mercado Livre | Reserva de publicidade sobre o preço, aplicada ao Clássico e ao Premium. |
| Ads Shopee | Reserva de publicidade somente da Shopee. |
| Outros custos por venda | Despesas adicionais da venda, como embalagem, quando ainda não incluídas no custo. |
| Frete do Mercado Livre | Custo do vendedor, conforme o [modo de frete utilizado](#frete). |

Informe cada despesa uma vez. Por exemplo, se a embalagem já está no custo do produto, não repita seu valor em outros custos.

### Taxas preservadas por cadastro

Cada produto guarda suas configurações de taxas, serviços e, quando houver, cotação oficial. Alterar outro produto não reescreve esse histórico. Ao editar e salvar o próprio produto, você confirma as configurações desse cadastro. Na Shopee, a edição prepara a política incorporada atual; salvar pode substituir as taxas legadas daquele registro.

Essa preservação também se aplica aos kits. Há duas atualizações específicas nos produtos vinculados: o preço do anúncio pode ser renovado, e o ACOS observado pode atualizar o Ads do Mercado Livre. As respectivas consultas e datas são apresentadas no painel.

### Encontrar, editar e excluir

Use a busca de **Meus produtos** para procurar por nome, categoria ou ID do Mercado Livre. Em **Ordenar por**, escolha nome, custo, peso, margem ou o preço de um canal; o botão de direção alterna crescente e decrescente.

Clique em **Editar** para ajustar um produto e salve ao terminar. **Excluir** pede confirmação. Se o produto participa de um kit, primeiro remova-o do kit ou exclua esse kit. Excluir um kit mantém os produtos individuais.

<a id="mercado-livre"></a>

## 4. Conectar um anúncio do Mercado Livre

### Conectar a conta

1. Use o painel no endereço publicado.
2. Clique em **Conectar Mercado Livre** ou **Conectar conta**.
3. Confira a conta e as permissões no próprio Mercado Livre e conclua a autorização.
4. Ao voltar ao painel, confira o estado da conexão.

Não é preciso criar uma conta no painel. A autorização do marketplace permite consultar informações da conta conectada. A configuração do aplicativo e das credenciais é uma tarefa do responsável pela integração: [configuração Mercado Livre](CONFIGURAR_MERCADO_LIVRE.md) e [hospedagem Cloudflare](CONFIGURAR_CLOUDFLARE.md).

| Consulta | Acesso necessário |
|---|---|
| Anúncios e condições de venda | Conexão com a conta e acesso aos recursos correspondentes. |
| Gastos e receitas de Product Ads | Permissão de publicidade em leitura e disponibilidade da API para a conta/aplicativo. |
| Faturamento dos pedidos para TACOS | **Vendas — Leitura**. Conectar o catálogo não comprova esse acesso. |

O painel faz consultas. Ele não altera preços no marketplace, cria pedidos ou edita campanhas. Use **Desconectar** para encerrar a conexão do painel. Se a sessão expirar, conecte novamente; o catálogo local permanece salvo.

### Vincular um produto

1. Abra **Novo produto** ou **Editar** e vá a **Anúncio**.
2. Escolha **Meu catálogo** ou informe o ID/link do anúncio e clique em **Vincular**.
3. Na lista, pesquise por nome ou ID. O painel percorre o catálogo automaticamente; aguarde a conclusão se houver muitos anúncios.
4. Confira nome, categoria, peso disponível, modalidade e preço importados.
5. Informe seu custo, margem, imposto e outros custos. A consulta do anúncio não fornece o custo de compra da empresa.
6. Confira **Usar tarifas oficiais do Mercado Livre**, aguarde a cotação e salve.

O catálogo consultado é reaproveitado por até cinco minutos na mesma aba e conta. **Atualizar catálogo** solicita uma nova leitura. Se a consulta falhar, use a mensagem exibida para tentar novamente; um resultado incompleto não comprova que o produto inexiste.

### Atualizar depois de salvar

- **Atualizar preços dos anúncios** renova o preço registrado e as referências de tarifa e frete para analisar esse preço atual.
- **Atualizar Ads · 30 dias** renova o desempenho publicitário que pode atualizar o Ads do Mercado Livre.
- **Consultar tarifas agora**, no cadastro, refaz a cotação para os parâmetros do formulário.

Esses botões não publicam as sugestões de preço no Mercado Livre.

<a id="precos"></a>

## 5. Entender preços, lucros e cores

### Ler um cartão de marketplace

Cada produto compara **ML Clássico**, **ML Premium** e **Shopee**. O cartão reúne preço, **Lucros** em reais e percentual, status, Ads e ROAS. Abra **Ver custos e taxas** para conferir os descontos e a origem dos valores.

| Informação | Significado |
|---|---|
| Preço de venda atual | Preço registrado do anúncio vinculado, no cartão da sua modalidade. |
| Preço sugerido de venda | Simulação para alcançar a margem desejada. |
| Sugestão para sua meta | Referência de preço que pode aparecer junto ao preço atual do anúncio. |
| Lucros | Valor que sobra por venda após os custos considerados e seu percentual sobre o preço. |
| Maior lucro | Maior lucro em reais entre os cenários disponíveis; não compara volume de vendas. |
| Mínimo para 10% / Preço para 10% (API) | Referência calculada separadamente para atingir pelo menos 10% de lucro. |

O lucro percentual é:

```text
Lucro (%) = lucro em reais ÷ preço de venda × 100
```

| Status | Lucro calculado sobre o preço |
|---|---:|
| Vermelho — **Lucro baixo** | Abaixo de 10% |
| Amarelo — **Em risco** | De 10% a menos de 15% |
| Verde — **Seguro** | A partir de 15% |

As cores seguem o resultado calculado. A margem desejada é a meta usada na sugestão. Por isso, um anúncio vendido por um preço maior pode mostrar 41% de lucro mesmo com meta de 20%.

Em produto vinculado, o resumo e a classificação do produto usam o preço atual registrado e a modalidade do anúncio. Sem preço atual, usam a média simples das simulações dos três canais, quando todas estiverem válidas. Os kits também usam a média simulada. Esses resumos representam lucro estimado por venda; não são faturamento mensal, lucro total da empresa ou média ponderada por quantidades vendidas.

### Como o preço sugerido é formado

Na simulação com taxas percentuais constantes:

```text
Preço = (custo + outros custos + taxa fixa aplicável + frete aplicável)
        ÷ [1 − (comissão + imposto + Ads + margem desejada) ÷ 100]
```

O preço é arredondado para cima ao centavo para preservar a meta. Nas consultas oficiais e nas faixas da Shopee, o painel verifica as condições aplicáveis ao preço; uma única divisão não descreve todas as mudanças de faixa.

**Exemplo didático:** venda de R$ 200, custo de R$ 100, frete de R$ 20, comissão de 14% (R$ 28), imposto de 6% (R$ 12) e Ads de 6% (R$ 12), sem outros custos. Sobram **R$ 28**, equivalentes a **14% — Em risco**. Esses percentuais são hipóteses do exemplo, não uma tabela universal de tarifas.

O percentual usa o preço de venda como base. Ganhar R$ 20 em uma venda de R$ 100 representa 20%, independentemente do percentual que esse valor representa sobre o custo.

### Referência para 10%

O cálculo para 10% inclui Ads e reavalia o frete aplicável. Na Shopee, verifica as faixas de preço. No modo oficial do Mercado Livre, é uma referência validada pela API; mudanças descontínuas de tarifa ou frete impedem prometer que seja o menor preço possível em qualquer cenário.

Se os percentuais e custos impedirem a meta, aparece uma indicação de inviabilidade ou de recálculo. Dados pendentes não devem ser interpretados como resultado seguro.

<a id="tarifas"></a>

## 6. Entender tarifas, impostos e frete

### Mercado Livre: manual e oficial

No modo manual, confira **Comissão Clássica**, **Comissão Premium** e **Imposto** no próprio cadastro. Valores manuais não identificam automaticamente uma tarifa de categoria.

Com **Usar tarifas oficiais do Mercado Livre**, o painel consulta a categoria, a modalidade, o preço e a logística do anúncio. Os campos de comissão ficam de consulta nesse modo. O total oficial é considerado uma vez: se houver parcela fixa na resposta, ela já integra a cobrança utilizada pelo cálculo. O cadastro de novos produtos não pede um adicional fixo manual do Mercado Livre. A [documentação de custos por vender](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender) descreve os parâmetros e os componentes retornados.

Confira a data da cotação. Alterar custo, peso, margem, Ads do Mercado Livre, imposto ou parâmetros do frete exige uma cotação compatível. Se a atualização falhar, resolva o aviso antes de salvar no modo automático. Alterar apenas Ads da Shopee não exige consultar novamente as tarifas do Mercado Livre.

### Imposto da empresa

O imposto permanece sob controle do usuário, por marketplace. A consulta de comissão e frete não descobre a alíquota tributária da Conduz Cobre. Use o percentual aplicável à sua operação, conferido com o responsável fiscal. CNPJ, sozinho, não define uma alíquota. Referência complementar: [regras tributárias do Mercado Livre](https://developers.mercadolivre.com.br/pt_br/envio-regras-tributarias).

<a id="frete"></a>

### Frete: qual valor entra no cálculo?

| Modo | Como o painel usa o frete |
|---|---|
| Cadastro manual, sem cotação automática | Calcula primeiro o preço sem o frete específico. Se esse preço, já arredondado, ultrapassar R$ 100, inclui o frete informado e recalcula. Em R$ 100 ou menos, esse adicional não entra. |
| Anúncio com frete automático válido | Usa a estimativa do custo do vendedor. Uma cotação automática reconhecida pode entrar também abaixo de R$ 100. |
| Tarifas oficiais | Consulta frete e comissão para os preços simulados e modalidades. O antigo limite manual de R$ 100 não comanda esse fluxo. |
| Shopee | O campo de frete do Mercado Livre não é aplicado à Shopee. |

O limite de R$ 100 é uma regra da simulação manual do painel. Não é uma afirmação sobre o limite oficial vigente de frete grátis do Mercado Livre.

O frete automático é uma estimativa do valor pago pelo vendedor, não o valor mostrado ao comprador. Peso, embalagem, logística, condições da conta e preço podem mudar o resultado. O campo usa quilogramas; a integração converte o peso para gramas. Confira o peso faturável e, quando aplicável, as medidas do pacote. Veja [custos de envio na documentação oficial](https://developers.mercadolivre.com.br/pt_br/custos-de-envio).

Em condições elegíveis, se a consulta de frete não permitir acesso, o painel pode recorrer à [tabela oficial 40538](https://www.mercadolivre.com.br/ajuda/40538) incorporada na versão, conferida em **12/11/2026**. A interface identifica essa origem. Ela não é uma atualização ao vivo da tabela. Logística, condição do produto, categoria e medidas podem exigir conferência adicional. Falha de consulta não é tratada como frete grátis.

### Shopee: política CNPJ incorporada

Não há conexão com a conta Shopee nesta versão. Novos cadastros usam a tabela CNPJ incorporada ao programa, conferida em **13/11/2026**. O painel aplica a faixa do preço calculado; não consulta a Central do Vendedor a cada venda.

| Preço por item | Comissão base incorporada | Parcela fixa incorporada |
|---|---:|---:|
| Abaixo de R$ 9 | 20% | Metade do preço |
| R$ 9 a R$ 79,99 | 20% | R$ 4,50 |
| R$ 80 a R$ 99,99 | 14% | R$ 16 |
| R$ 100 a R$ 199,99 | 14% | R$ 20 |
| A partir de R$ 200 | 14% | R$ 26 |

Os valores e as condições documentados para essa política estão em [Política Shopee do projeto](POLITICA_SHOPEE.md), com links para a [política de comissão](https://seller.shopee.com.br/edu/article/26839).

- **Devolução Fácil:** a marcação aplica R$ 0,49 por pedido na simulação. Represente uma cobrança ativa, considerando eventual período gratuito na conta. [Fonte do programa](https://seller.shopee.com.br/edu/article/26700).
- **Eventos Oficiais / Campanhas de Destaque:** a marcação aplica o adicional padrão incorporado de **5 pontos percentuais**. Exemplo: comissão base de 14% passa a 19%. Confira a participação e as condições da campanha. [Fonte do programa](https://seller.shopee.com.br/edu/article/18712).

Você controla as duas caixas; elas podem ser usadas juntas. A automação preenche valores e faixas, mas não detecta adesão da loja. A simulação considera um item ou um kit anunciado por pedido. Taxas legadas ficam preservadas até a edição e o salvamento do próprio registro. Mudanças futuras da política exigem conferência e atualização do painel.

<a id="kits"></a>

## 7. Montar e manter kits

1. Cadastre os produtos individuais em **Meus produtos**.
2. Abra **Montar kits** e informe nome, margem, Ads de cada marketplace e custo adicional do kit.
3. Busque os componentes, selecione-os e ajuste suas quantidades.
4. Confira custo dos produtos, outros custos totais, peso e número de unidades.
5. Escolha o modo manual ou **Calcular frete e comissões oficiais para este kit**.
6. Confira os três preços e clique em **Salvar kit**.

Custos, pesos e outros custos dos componentes são multiplicados pelas quantidades. O custo adicional do kit entra uma vez. Ads é o percentual do próprio kit; os percentuais dos componentes não são somados. Comissão e frete são calculados para a venda do conjunto, sem somar os preços de venda dos produtos individuais.

### Cotação oficial do kit

Escolha a **categoria do kit**, que pode ser diferente da categoria dos componentes. Confira a sugestão ou use **Buscar categoria**. Escolha também uma **Referência de logística** entre os anúncios vinculados: ela identifica a logística da conta, não fornece custo, preço, publicidade ou categoria definitiva para o conjunto.

Em **Medidas da embalagem**, informe altura, largura e comprimento do kit embalado quando disponíveis. Sem medidas, a estimativa utiliza o peso total e as regras de referência aplicáveis; uma embalagem volumosa pode gerar custo diferente. Clique em **Atualizar cotação** quando necessário.

### O que muda em um kit salvo

O kit guarda suas taxas e sua cotação. Os custos e pesos dos componentes continuam acompanhando o catálogo. Se uma mudança nos componentes tornar a cotação incompatível, atualize-a antes de usar as sugestões. Para modificar o conjunto, use **Editar kit**. **Limpar / novo kit** limpa a montagem em edição para iniciar outra.

Os kits montados mantêm Ads manual. O anúncio usado como referência logística não identifica publicidade do kit. Para acompanhar um kit que já possui anúncio próprio, cadastre-o como produto e vincule esse anúncio.

<a id="csv"></a>

## 8. Importar e exportar CSV

### Cadastrar vários produtos

1. Prepare um CSV com cabeçalho **nome**, **custo** e **peso**.
2. Clique em **Importar CSV**, selecione o arquivo e informe categoria e margem do lote.
3. Confira a prévia e corrija os erros apontados.
4. Clique em **Importar produtos** quando a validação estiver concluída.

Exemplo de conteúdo, com ponto e vírgula:

```csv
nome;custo;peso
Garrafa térmica;30,00;0,350
Camiseta básica;25,00;0,200
Organizador;18,90;0,125
```

| Regra | Formato aceito |
|---|---|
| Tamanho e quantidade | Até 2 MB e 5.000 produtos por arquivo. |
| Separador | Ponto e vírgula, vírgula ou tabulação. |
| Custo | Valor positivo, sem `R$`, sem separador de milhares e com até duas casas decimais. |
| Peso | Quilogramas, com até três casas decimais. |
| Vírgula como separador | Use ponto decimal ou coloque números com vírgula decimal entre aspas. |
| Campos com separador no texto | Coloque o conteúdo entre aspas duplas. |
| Colunas adicionais | São ignoradas na importação. |

Havendo erro em qualquer linha, nenhum produto do arquivo é importado até a correção. O catálogo existente é mantido; nomes repetidos criam novos cadastros. O lote recebe categoria, margem e taxas preparadas na importação. Frete e outros custos começam em zero. A planilha de três colunas não cria vínculos com anúncios nem configura Ads; revise os novos registros depois de importar.

### Exportar a precificação

Em **Meus produtos**, **Exportar CSV** baixa os produtos visíveis, na ordem atual. Se há uma busca ativa, apenas os resultados encontrados são exportados. Limpe a busca para exportar todo o catálogo de produtos.

O arquivo reúne preços, lucros, mínimos para 10%, Ads, taxas, origem das consultas e classificações. Alguns cabeçalhos conservam o termo técnico “margem efetiva”; ele corresponde ao percentual calculado de lucro sobre o preço.

Na **Gestão de Ads**, o botão **Exportar CSV** pertence ao comparativo e exporta seus resultados filtrados. Ele é diferente do CSV de precificação. Para recuperar todos os produtos, kits e configurações, use o backup JSON.

<a id="backup"></a>

## 9. Baixar e restaurar um backup

### Baixar

Em **Meus produtos**, localize **Backup dos dados** e clique em **Baixar backup**. Guarde o arquivo `.json` em uma pasta conhecida. Ele inclui o catálogo completo, kits, taxas preservadas, referências consultadas e dados da Gestão de Ads, mesmo com uma busca ativa.

O backup pode conter informações financeiras da empresa; compartilhe-o apenas com quem precisa desses dados. Credenciais secretas da integração e a sessão autenticada não fazem parte do arquivo. O backup não substitui a configuração da hospedagem nem a conexão com o Mercado Livre no outro aparelho.

### Restaurar ou transferir para outro aparelho

1. No navegador de destino, abra o painel.
2. Se houver dados que você deseja guardar, baixe um backup deles primeiro.
3. Clique em **Restaurar backup** e selecione o JSON baixado pelo painel, de até 20 MB.
4. Confira a quantidade de produtos, kits e o resumo apresentado.
5. Clique em **Substituir dados e restaurar** para confirmar.

**A restauração substitui o estado local atual.** Com o catálogo compartilhado ativo, a mudança também será sincronizada com a empresa e passará pela conferência de versão. A restauração não mescla cadastros. Arquivos inválidos não são aplicados. Backups antigos compatíveis são aceitos, mas não recebem métricas históricas que nunca foram registradas. Esta versão gera backup v18 e aceita backups das versões anteriores.

Um CSV exportado não é um backup completo e não restaura todas as configurações. O próprio arquivo `index.html` também não contém os produtos salvos pelo seu navegador.

<a id="ads"></a>

## 10. Usar a Gestão de Ads

### Ads de precificação e resultado da publicidade

| Informação | Uso |
|---|---|
| **Ads (%) do cadastro** | Reserva de custo publicitário sobre o preço de uma venda. Participa do preço sugerido, do lucro e da referência para 10%. |
| **ROAS equivalente** | `100 ÷ Ads (%)`. Ads de 6% equivale a aproximadamente 16,7x. Com zero, o selo mostra um traço. É uma referência do percentual informado. |
| **ACOS e ROAS consultados** | Relações calculadas a partir do investimento e da receita atribuída do período pela API. |
| **Lucro estimado · diretas** | Aproximação do resultado das vendas diretas com custos e tarifas de referência do cadastro. |
| **Lucro apurado · conciliado** | Resultado que exige conferir e registrar receitas e despesas efetivas do período. |

O ROAS mede receita em relação ao gasto, não lucro. Vendas indiretas podem envolver outro produto da loja. A documentação de Product Ads distingue receitas, vendas e unidades e informa janela de atribuição de **14 dias**; dados recentes podem mudar. [Fonte oficial](https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura).

### Atualização automática do Ads do Mercado Livre

Para produtos vinculados à conta conectada, a integração consulta os **últimos 30 dias encerrados**, no fuso de São Paulo. Com dados válidos, o ACOS observado atualiza **Ads Mercado Livre (%)**. O painel arredonda esse percentual para cima em duas casas e recalcula as cotações oficiais compatíveis. O preço atual do anúncio é preservado.

O cartão da modalidade vinculada apresenta investimento, período e ROAS real. Os outros cenários mantêm a referência equivalente, evitando apresentar a mesma publicidade como se fossem campanhas distintas. Consultas válidas podem ser reutilizadas por dez minutos; **Atualizar Ads · 30 dias** força a atualização.

Sem receita, permissão ou dados completos, o percentual anterior é preservado. ACOS de 100% ou mais continua como informação de desempenho, mas não é aplicado ao campo de precificação, que exige um percentual abaixo de 100%. Shopee e kits montados mantêm seus Ads manuais.

O gasto total do período não é descontado novamente do lucro por venda: nessa simulação, Ads já entra pelo percentual aplicado.

### Cartões e projeções

1. Abra **Gestão de Ads** e, se necessário, conecte a conta.
2. Use **Atualizar dados de Ads**. Se houver mais de um anunciante, selecione o desejado.
3. Abra **Cartões e projeções** para analisar os totais e os produtos cadastrados.
4. Confira datas, cobertura da consulta e a separação entre diretas e indiretas.

O resumo do **anunciante** pode incluir campanhas de produtos que não estão cadastrados no painel. O resumo dos **produtos cadastrados** tem outro alcance e evita somar repetidamente o mesmo anúncio vinculado a vários cadastros. Confira a quantidade de anúncios efetivamente consultados antes de comparar totais.

Os produtos aparecem em quadrados. Em **Cor dos cartões**, escolha lucro estimado das diretas ou lucro apurado conciliado. Mais lucro em reais na base escolhida produz azul mais intenso; prejuízo tem azul discreto e falta de dados deixa o fundo neutro. Essa escala é própria do painel e não usa a classificação vermelho/amarelo/verde da precificação.

### Planejar um investimento

Em **Planeje o investimento**, escolha a base — produtos cadastrados ou anunciante —, informe o investimento diário e selecione horizonte de 7, 30 ou 90 dias.

O cenário multiplica o orçamento pelos dias e projeta receita, cliques e unidades mantendo as relações do histórico. Nos cadastrados, conserva a distribuição histórica do investimento entre anúncios. A previsão não altera campanhas e não garante o mesmo desempenho futuro. Sem histórico suficiente, o investimento pretendido pode ser mostrado, mas o retorno não é presumido.

### Comparar períodos

1. Abra **Comparativo por períodos**.
2. Escolha **Data-base**, último dia do intervalo.
3. Escolha **Período** e **Métrica**.
4. Se quiser, pesquise por nome, MLB ou SKU e clique em **Filtrar**.
5. Confira as datas nos cabeçalhos e o total recalculado. Abra os detalhes da célula para entender sua base.

| Escolha | Intervalos exibidos |
|---|---|
| Semanal | Quatro períodos de 7 dias; total de 28 dias. |
| Quinzenal | Quatro períodos de 14 dias; total de 56 dias. |
| Mensal | Três períodos de 30 dias; total de 90 dias. Não são necessariamente meses do calendário. |

O painel consulta a API para dias encerrados dentro dos últimos 90 dias disponíveis. Por exemplo, data-base 15/11/2026 na visão semanal corresponde a 19–25/10, 26/10–01/11, 02–08/11 e 09–15/11. Quando esse intervalo sair da janela disponível, não poderá ser atualizado pela API, mas o relatório já salvo continuará disponível para leitura.

### Relatórios e conciliações compartilhados

Com o catálogo da empresa ativo, os comparativos por período, resumos do anunciante e conciliações também são guardados na nuvem. Dados existentes da conta autorizada são incorporados ao sincronizar; não é preciso exportar arquivos. Os dados de outras contas que estiverem no navegador permanecem locais.

Use **Relatórios salvos**, no comparativo, para abrir um período já arquivado. A seleção lê os valores guardados, sem consultar novamente o Mercado Livre. Uma consulta de outro período não apaga esse relatório. A data da consulta continua visível; um relatório salvo não significa que os números foram atualizados hoje. Cada funcionário mantém seus próprios filtros de visualização.

Conciliações de anúncios ou períodos diferentes são combinadas. Se dois funcionários alterarem a mesma conciliação com valores diferentes, o painel pede **Revisar alterações**. Confira receita, despesas, escopo e fonte antes de escolher a versão. Compartilhar uma conciliação não elimina a necessidade de rever os valores quando a evidência de Ads mudar.

Os backups v18 incluem os relatórios arquivados, resumos e conciliações. Backups anteriores continuam aceitos e não apagam os arquivos de Ads já compartilhados. Se uma aba antiga pedir atualização, recarregue a página para usar a sincronização atual.

SKU usa o identificador oficial disponibilizado pelo Mercado Livre. Se a API não informar SKU, use nome ou MLB. Consultas podem demorar conforme o número de anúncios e pedidos. Se forem interrompidas, resultados incompletos são identificados; as partes ausentes não viram zero.

Em **Azul por**, o padrão é lucro estimado em reais. Você pode escolher lucro conciliado ou a métrica selecionada. Com investimento selecionado como base de cor, azul forte significa maior gasto. As setas mostram aumento ou queda da métrica, sem classificar automaticamente isso como melhora.

Alterar filtros do comparativo não altera o ACOS de 30 dias usado na precificação.

### ACOS, ROAS, CPC e TACOS

| Métrica | Fórmula | Leitura |
|---|---|---|
| ACOS | Gasto Ads ÷ receita atribuída a Ads × 100 | Quanto da receita atribuída foi consumido pelo investimento. |
| ROAS | Receita atribuída a Ads ÷ gasto Ads | Receita atribuída por real investido. |
| CPC médio | Gasto Ads ÷ cliques | Custo médio por clique recebido. |
| TACOS do anúncio | Gasto Ads ÷ faturamento confirmado do próprio anúncio × 100 | Publicidade em relação às vendas confirmadas desse item. |

As três primeiras métricas seguem as definições de [Product Ads](https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura). A base específica do TACOS é a metodologia do painel, detalhada abaixo. Gastos, cliques e receitas dos períodos são somados antes de calcular os indicadores totais; o total não é a média simples dos percentuais semanais.

**Exemplo didático:** R$ 300 investidos, R$ 5.000 de receita atribuída, 500 cliques e R$ 10.000 de faturamento confirmado do item resultam em ACOS de 6%, ROAS de 16,67x, CPC de R$ 0,60 e TACOS de 3%. Esses indicadores, sozinhos, não determinam o lucro.

### Qual faturamento forma o TACOS?

O painel consulta os pedidos da conta por anúncio e data de criação da venda em São Paulo. A base considera o valor dos produtos do próprio anúncio após descontos oficiais e ajustes financeiros confirmados, antes de tarifas, imposto e frete. Não utiliza o repasse líquido do Mercado Pago nem o valor de todos os itens de um pacote.

Descontos já incluídos no preço não são abatidos outra vez. Cancelamentos e reembolsos confirmados são tratados pela situação financeira. Uma entrega pendente ou devolução física não comprova reembolso: vendas pagas podem permanecer na receita. Desconto ou restituição parcial sem valor inequívoco do item deixa o TACOS pendente. Essas são regras do painel para aplicar os dados de [pedidos e descontos oficiais](https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas), não uma promessa de reproduzir a metodologia de outro aplicativo.

Sem **Vendas — Leitura**, acesso completo ou confirmação financeira suficiente, o TACOS mostra **Sem dados suficientes**. Ter ACOS e ROAS disponíveis não comprova que os pedidos também estejam acessíveis. A consulta de faturamento para TACOS não calcula automaticamente o custo efetivo de cada venda.

### Conciliar o lucro apurado

1. No cartão, clique em **Conciliar lucro apurado**; no comparativo, use **Conciliar período**.
2. Confira produto e período.
3. Escolha se está incluindo somente vendas diretas ou diretas e indiretas.
4. Informe os totais efetivos de receita após ajustes, custo dos produtos vendidos, tarifas, impostos, frete e outras despesas.
5. Descreva a fonte da conferência e o critério de distribuição.
6. Marque a confirmação de conferência e clique em **Salvar conciliação**.

Informe zero quando uma despesa foi conferida e não existiu. Campo vazio não equivale a conferência. Se incluir receitas indiretas, inclua também os custos dos outros produtos envolvidos.

Não coloque o gasto de Ads entre as outras despesas: o valor consultado é subtraído uma vez pelo painel.

```text
Lucro apurado = receita conciliada − despesas conciliadas − Ads consultado
```

A conciliação é manual e fica registrada por anúncio e período. Se a evidência financeira de Ads mudar, a conciliação exige revisão. Um total parcialmente conciliado é identificado e não deve ser lido como lucro completo da conta.

### Quando aparece “Sem dados suficientes”

Isso pode indicar falta de histórico, permissão, separação de diretas e indiretas, custo válido, consulta completa de vendas ou conciliação. Não significa que não houve gasto. Zero só representa um resultado quando há informação válida que o sustente. Detalhes da metodologia estão em [Gestão de Ads e metodologia](ESTATISTICAS_ADS.md).

<a id="duvidas"></a>

## 11. Resolver dúvidas e avisos

| Dúvida ou aviso | O que conferir |
|---|---|
| “Meu catálogo sumiu no celular.” | Confirme endereço e conexão com a conta permitida. Com compartilhamento ativo, sincronize; no modo local, restaure o backup correto. |
| “A meta é 20%, mas aparece outro lucro.” | Veja se o cartão usa preço atual do anúncio. A meta determina a sugestão; o lucro usa o preço apresentado e seus custos. |
| “O frete não entrou abaixo de R$ 100.” | Confira se é o modo manual. O automático usa a cotação reconhecida e tem condições próprias. |
| “As comissões estão bloqueadas.” | Confira se o modo oficial está ativo. Nesse modo os campos mostram a consulta. |
| “Não consigo salvar a cotação.” | Confira conexão, valores obrigatórios e a mensagem de atualização pendente ou inviável. Refaça a consulta. |
| “O lucro do kit mudou.” | Confira se custos, pesos ou quantidades dos componentes mudaram e se a cotação precisa ser atualizada. |
| “Ads mudou sozinho.” | Produtos vinculados podem receber o ACOS real dos últimos 30 dias encerrados. Confira período, conta e última consulta. |
| “Tenho ROAS, mas não tenho TACOS.” | Confira Vendas em Leitura e os detalhes da base de pedidos. As fontes são diferentes. |
| “Meu total difere do Letzee ou de outro aplicativo.” | Compare anúncio, datas, fuso, atribuição, descontos, cancelamentos e base do faturamento. Não se presume igualdade entre metodologias. |
| “O anúncio não aparece na busca.” | Na seleção do catálogo, aguarde a leitura completa ou atualize. Na Gestão de Ads, confira se o produto já está cadastrado e vinculado à conta correta. |
| “A importação não aceita o CSV.” | Confira cabeçalho, separador, casas decimais e mensagens por linha. Corrija o arquivo e selecione-o novamente. |
| “Não consigo excluir um produto.” | Remova-o dos kits que o utilizam ou exclua esses kits primeiro. |
| “Aparece Dados só nesta sessão.” | Baixe um backup imediatamente e confira se o navegador permite armazenamento local. |
| “A conexão falhou ou expirou.” | Conecte novamente. Se o aviso indicar configuração ou permissão, encaminhe-o ao responsável pela integração. |

<a id="rotina"></a>

## 12. Rotina sugerida

Ao começar, confira se está usando o catálogo correto e se a gravação local está funcionando. Atualize os preços e Ads quando precisar de uma análise renovada. Revise os produtos em vermelho ou amarelo olhando também as despesas detalhadas.

Ao alterar custo ou embalagem, confira os kits afetados e refaça cotações pendentes. Na Gestão de Ads, leia o período e a cobertura da consulta antes dos totais. Para registrar lucro apurado, use despesas efetivas do mesmo período e guarde a fonte da conferência.

Ao terminar alterações relevantes, baixe um backup com a data e siga o procedimento combinado entre os funcionários para manter a cópia principal.

<a id="fontes"></a>

## 13. Fontes e referências

### Como este manual foi preparado

As instruções e os nomes dos controles foram conferidos nos [campos da interface](src/index.html), nas [regras e fluxos do painel](src/app.js), na [sincronização do catálogo](src/catalog-sync.js) e na consulta de [vendas](netlify/lib/ml-sales.mjs) e [regras financeiras](netlify/lib/ml-sales-rules.mjs). Consulte o [histórico do projeto](https://github.com/diegorodriguesccobre-eng/meu-painel-m/commits/main) para acompanhar as revisões. As faixas, arredondamentos, cores e limites de uso descritos representam esta implementação.

A pesquisa desta edição consultou a documentação oficial disponível e os resultados indexados do Mercado Livre. Algumas páginas oficiais bloquearam a leitura direta, e as páginas da Shopee não disponibilizaram o conteúdo no acesso automatizado. Portanto, os valores incorporados de Shopee e da tabela alternativa de frete mantêm as datas de conferência indicadas; esta edição do manual não declara uma nova validação integral dessas tabelas em 24/11/2026.

### Documentação oficial

| Referência | Uso no manual |
|---|---|
| [Mercado Livre — Custos por vender](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender) | Categoria, modalidade, parâmetros e componentes da tarifa. |
| [Mercado Livre — Custos de envio](https://developers.mercadolivre.com.br/pt_br/custos-de-envio) | Estimativa de envio e condições do vendedor. |
| [Mercado Livre — Tabela de frete 40538](https://www.mercadolivre.com.br/ajuda/40538) | Referência da tabela incorporada em condições elegíveis. |
| [Mercado Livre — Product Ads para Catálogo e User Products](https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura) | Métricas de publicidade, diretas, indiretas e atribuição. |
| [Mercado Livre — Pedidos e descontos](https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas) | Dados de venda utilizados na base financeira do TACOS. |
| [Mercado Livre — Regras tributárias](https://developers.mercadolivre.com.br/pt_br/envio-regras-tributarias) | Referência fiscal complementar; não fornece uma alíquota única da empresa. |
| [Shopee — Política de comissão](https://seller.shopee.com.br/edu/article/26839) | Fonte da política CNPJ incorporada. |
| [Shopee — Devolução Fácil](https://seller.shopee.com.br/edu/article/26700) | Condições do serviço opcional. |
| [Shopee — Campanhas de Destaque](https://seller.shopee.com.br/edu/article/18712) | Condições do adicional representado por Eventos Oficiais. |

### Material complementar do projeto

- [Metodologia de Ads, projeções, conciliação e TACOS](ESTATISTICAS_ADS.md).
- [Política Shopee incorporada, condições e preservação](POLITICA_SHOPEE.md).
- [Configuração da integração Mercado Livre](CONFIGURAR_MERCADO_LIVRE.md).
- [Configuração do Cloudflare e transferência por backup](CONFIGURAR_CLOUDFLARE.md).
- [Catálogo compartilhado: acesso, sincronização, migração e plano gratuito](CONFIGURAR_CATALOGO.md).

Letzee, AdMan e Mercado Turbo foram referências públicas de apresentação e conceitos. O painel não declara reproduzir seus cálculos internos. Os links e as diferenças de método estão na [documentação de Ads do projeto](ESTATISTICAS_ADS.md#comparativo-por-períodos-e-referências-de-método).
