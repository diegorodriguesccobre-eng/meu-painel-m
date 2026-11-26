# Manual do usuário — Conduz Cobre

**Painel de precificação, kits e Gestão de Ads**  
Edição de **26/11/2026**, baseada nas funções disponíveis nesta versão.

[Abrir o painel](https://precificacaoconduz.conduz-cobre.workers.dev/) · [Página do projeto](README.md)

O painel ajuda a definir preços no Mercado Livre e na Shopee, comparar o lucro por venda e acompanhar publicidade do Mercado Livre. Mantém uma cópia no navegador e compartilha produtos, kits, relatórios e conciliações de Ads na nuvem quando o catálogo da empresa está ativo. A conexão com o Mercado Livre consulta dados do marketplace e também controla o acesso ao catálogo compartilhado; salvar um produto ou simular um orçamento aqui não publica anúncios nem altera campanhas.

## Índice

- [1. Começar e cuidar dos dados](#comecar)
  - [Entrar, identificar-se e aceitar os documentos](#entrada-painel)
  - [Acessar o catálogo compartilhado](#catalogo-compartilhado)
  - [Trocar de empresa com catálogos separados](#empresas-separadas)
  - [Entender os avisos de sincronização](#sincronizacao)
  - [Resolver conflitos de edição](#conflitos)
- [2. Conhecer as telas](#telas)
  - [Recolher e expandir o menu no computador](#menu-computador)
  - [Entender como a preferência fica salva](#preferencia-menu)
  - [Usar o menu no celular](#menu-celular)
- [3. Cadastrar e editar produtos](#produtos)
  - [Buscar produtos](#buscar-produtos)
  - [Ordenar produtos](#ordenar-produtos)
  - [Usar busca e ordenação no celular](#busca-ordenacao-celular)
- [4. Conectar um anúncio do Mercado Livre](#mercado-livre)
  - [Importar e conferir o catálogo completo](#importar-conferir-catalogo)
- [5. Entender preços, lucros e cores](#precos)
- [6. Entender tarifas, impostos e frete](#tarifas)
- [7. Montar e manter kits](#kits)
  - [Atualizar a cotação quando o custo dos componentes mudar](#atualizar-cotacao-kit)
- [8. Importar e exportar CSV](#csv)
  - [Exportar produtos filtrados em CSV](#exportar-produtos-filtrados)
  - [Exportar no computador](#exportar-csv-computador)
  - [Exportar no celular](#exportar-csv-celular)
  - [Exportar CSV ao trocar entre buscas válidas](#exportar-csv-trocar-buscas-validas)
  - [Quando Exportar CSV fica desativado](#exportar-csv-desativado)
  - [Desativar CSV ao trocar por uma busca sem resultados](#exportar-csv-busca-sem-resultados)
  - [Reativar CSV ao trocar por uma busca válida](#exportar-csv-busca-valida)
  - [Exportar todos ao limpar a busca](#exportar-todos-produtos)
- [9. Baixar e restaurar um backup](#backup)
- [10. Usar a Gestão de Ads](#ads)
- [11. Resolver dúvidas e avisos](#duvidas)
- [12. Rotina sugerida](#rotina)
- [13. Fontes e referências](#fontes)

<a id="comecar"></a>

## 1. Começar e cuidar dos dados

### Abrir o painel

No computador ou celular, abra o [endereço publicado](https://precificacaoconduz.conduz-cobre.workers.dev/) em um navegador atualizado. A versão atual exige entrada pela conta do Mercado Livre da empresa, sem criar uma senha própria do painel.

<a id="entrada-painel"></a>

### Entrar, identificar-se e aceitar os documentos

1. Clique em **Entrar com Mercado Livre** e conclua a autenticação e a autorização no próprio marketplace. Se a conta já estiver conectada, confira seu nome ou use **Usar outra conta**.
2. Informe **Seu apelido** e escolha **Sua função**: Colaborador, ADM, Dono ou Analista. A função é identificação autodeclarada; não altera permissões nem comprova vínculo com a empresa.
3. Abra e leia os **Termos de uso** e a **Política de privacidade** nos links próprios. Os controles ficam lado a lado, com caixas independentes e inicialmente vazias. Marque os dois para continuar. Esse aceite não é autorização genérica para publicidade ou novos usos dos dados.
4. Clique em **Prosseguir**. O painel só aparece com sessão válida, identificação e aceite da versão atual e carrega os dados da empresa correspondente.
5. Após a confirmação do catálogo compartilhado, a busca dos anúncios começa automaticamente. Anúncios novos são adicionados como pendências de custo. Se houver primeira associação ou conflito, conclua essa revisão antes da importação.

O apelido, a função e as versões/data do aceite ficam na sessão criptografada, que dura até seis horas ou o prazo menor do token. Recarregar mantém uma sessão válida. Nova autenticação, expiração ou mudança de versão dos documentos exige nova confirmação. O apelido e a função aparecem no menu; ainda não há auditoria individual da autoria de cada edição.

Use **Sair** no menu para encerrar a sessão neste navegador; no celular, abra **Menu → Sair**. As caixas de aceite ficam vazias novamente. Sair não apaga os produtos, kits, pendências, relatórios e conciliações da empresa, nem cópias locais ou arquivos exportados. O contato informado para dúvidas de privacidade é **diego.rodriguesccobre@gmail.com**.

O HTML isolado não realiza o login da versão atual. Para uso normal, utilize o site publicado. A autenticação, a sincronização e as consultas precisam de internet.

### Onde ficam os dados

O indicador **Salvo neste navegador** confirma a gravação local. Com o catálogo compartilhado configurado, produtos, kits e suas configurações também ficam na nuvem. Comparativos por períodos, resumos do anunciante e conciliações da Gestão de Ads também são compartilhados com a conta autorizada da empresa.

| Situação | O que acontece com o catálogo |
|---|---|
| Reabrir o mesmo endereço, navegador e perfil | O catálogo salvo continua disponível. |
| Abrir em outro computador, celular, navegador ou perfil | Com compartilhamento ativo, conecte a conta autorizada para carregar o catálogo; no modo local, transfira por backup. |
| Trocar de domínio, como Netlify para Cloudflare | O novo endereço começa com armazenamento separado. |
| Limpar os dados do site ou usar uma sessão privada | A cópia local e alterações ainda não sincronizadas podem ser perdidas; o catálogo já confirmado na nuvem pode ser carregado novamente. |
| Quatro funcionários acessarem o mesmo site | Com o compartilhamento ativo e a conta autorizada conectada, utilizam o mesmo catálogo; sem ele, cada navegador tem sua cópia. |

<a id="catalogo-compartilhado"></a>

### Acessar o catálogo compartilhado — passo a passo para os funcionários

1. No computador ou celular, abra o [endereço oficial do painel](https://precificacaoconduz.conduz-cobre.workers.dev/).
2. Na tela de entrada, clique em **Entrar com Mercado Livre**. Use a conta autorizada da empresa e conclua o acesso no próprio marketplace. Depois, informe apelido e função, leia e marque os dois documentos e clique em **Prosseguir**. Veja o [fluxo de entrada](#entrada-painel).
3. Confira o nome da conta conectada em **Meus produtos**. Uma conta pessoal ou outra loja não dá acesso ao catálogo da Conduz Cobre.
4. No bloco **Catálogo da empresa**, aguarde **Catálogo compartilhado carregado** ou **Catálogo sincronizado com a empresa**. Esse bloco aparece acima do conteúdo em **Meus produtos**, **Montar kits** e **Gestão de Ads**.
5. Confira os produtos e kits. Na Gestão de Ads, use **Relatórios salvos** para abrir um comparativo já guardado. Não é necessário importar arquivos para receber os dados confirmados na nuvem.

O painel usa a conexão existente com o Mercado Livre, sem uma senha própria. Cada navegador precisa ter uma sessão válida da conta autorizada. Esta versão registra apelido e função na sessão, mas não possui convites por e-mail, contas individuais independentes, permissões diferentes por funcionário nem auditoria de autoria de cada edição.

**Navegador sem cadastros locais:** carrega a base compartilhada ao conectar. **Navegador que já tem produtos, kits ou dados de Ads:** pode pedir uma primeira associação antes de enviar ou substituir esses dados.

<a id="empresas-separadas"></a>

### Trocar de empresa com catálogos separados

Empresas autorizadas, como **Conduz Cobre** e **Conduz Energia**, usam o mesmo endereço
com seus próprios produtos, kits, taxas, relatórios e conciliações de Ads. Cada
funcionário conecta a conta do Mercado Livre da empresa em que vai trabalhar.

1. Conclua ou cancele formulários abertos e aguarde a confirmação de sincronização
   da empresa atual.
2. No menu, use **Sair** (ou **Desconectar** em **Conexão com o Mercado Livre**) para encerrar a conexão
   deste navegador. As cópias dos catálogos permanecem guardadas.
3. Na tela de entrada, clique em **Entrar com Mercado Livre** e entre com a conta da empresa desejada.
   Se o Mercado Livre mostrar outra conta, troque a conta no próprio marketplace
   e reinicie a conexão. A identificação e a autorização são feitas no Mercado Livre.
4. Confira **Conta conectada**, o nome da empresa e o aviso em **Catálogo da empresa**
   antes de cadastrar ou editar. Uma conta nova precisa ser liberada pelo responsável
   pela implantação antes de acessar o catálogo compartilhado.

Ao trocar de empresa, o painel carrega a cópia correspondente à conta conectada.
A Conduz Energia começa com um catálogo próprio; conectar essa conta não transfere
os cadastros da Conduz Cobre. Ao voltar à conta anterior, seus dados voltam a aparecer.
O backup baixado pertence ao catálogo aberto naquele momento; confira a empresa
antes de restaurar um arquivo.

**Abas do mesmo perfil compartilham a sessão do Mercado Livre.** Se você trocar a
conta em uma aba, as outras podem pedir para recarregar antes de sincronizar ou
consultar anúncios. A cópia local é preservada. Para trabalhar nas duas empresas
ao mesmo tempo, utilize perfis diferentes do navegador.

### Primeira associação de um navegador que já possui dados

Após a [configuração do responsável](CONFIGURAR_CATALOGO.md), abra **Revisar alterações**, no bloco **Catálogo da empresa**, quando o painel pedir para escolher como iniciar o compartilhamento.

Confira as quantidades locais e da empresa. **Combinar e sincronizar** mantém cadastros distintos dos dois lados e pede uma escolha para as diferenças em um mesmo registro. Produtos com o mesmo nome, mas cadastrados separadamente, podem virar duplicatas: combinar não identifica produtos apenas pelo nome.

**Usar somente o catálogo da empresa** adota a base compartilhada no lugar da cópia local desses cadastros. Use essa opção somente se os dados locais não precisarem ser acrescentados à empresa. Antes de confirmar, o painel preserva uma cópia anterior neste navegador; esse registro não é uma tela de histórico nem substitui um backup JSON que você possa baixar e guardar.

<a id="sincronizacao"></a>

### Como funciona a sincronização

Primeiro, conclua o formulário com **Salvar produto**, **Salvar kit** ou **Salvar conciliação**. Campos de um formulário ainda aberto não são enviados como um cadastro salvo. Depois de salvar, o painel mantém a cópia local e tenta enviar a alteração automaticamente.

Com a página visível e sem edição ou consulta em andamento, a base da empresa é conferida aproximadamente a cada minuto. O painel também tenta conferir os dados ao recuperar a conexão ou retornar à janela. Para solicitar uma conferência, clique em **Sincronizar agora**. A atualização não é instantânea entre todos os aparelhos.

| Mensagem no painel | O que significa e o que fazer |
|---|---|
| **Salvo neste navegador** | Existe uma cópia local. Isso, sozinho, não confirma o envio para a nuvem. Confira a conexão e o bloco Catálogo da empresa. |
| **Catálogo compartilhado carregado** | A base da empresa foi recebida neste navegador. |
| **Alteração salva neste navegador; aguardando sincronização** ou **Alterações aguardando sincronização** | Há uma gravação local pendente. Aguarde a confirmação ou use Sincronizar agora. |
| **Catálogo sincronizado com a empresa** | A conferência terminou e os dados foram confirmados na base compartilhada. |
| **Há uma atualização da empresa. Conclua a edição ou consulta em andamento para recebê-la** | O painel está protegendo o trabalho em andamento. Termine ou cancele o formulário e solicite a sincronização. |
| **Há alterações simultâneas no mesmo cadastro** | É necessário [revisar o conflito](#conflitos). Sincronizar novamente não escolhe uma versão por você. |
| **Catálogo compartilhado aguardando configuração** | Os dados continuam locais. Procure o responsável pela integração. |
| **A cópia local foi mantida**, junto de uma falha de conexão | As alterações não foram descartadas. Recupere a conexão e tente novamente. Se o aviso pedir para conectar a conta, conclua a entrada no Mercado Livre. |

Se o painel já estiver carregado quando a conexão cair, você pode salvar alterações localmente. Mantenha esse navegador e aguarde a confirmação de sincronização; não limpe os dados do site nem encerre uma sessão privada enquanto houver pendências. Se a falha ocorrer ao abrir, o painel tenta retomar a sessão existente quando a conexão voltar, respeitando sua validade. Sessão expirada exige nova conexão com o Mercado Livre.

| Compartilhado com a empresa | Mantido por navegador |
|---|---|
| Produtos, custos, pesos, Ads, vínculos, taxas e cotações preservadas | Sessão de acesso ao Mercado Livre |
| Kits, componentes, quantidades e parâmetros próprios | Filtros de visualização e campos de simulação |
| Relatórios de Ads por período e resumos do anunciante | Formulários ainda não salvos |
| Conciliações de Ads, com receitas, despesas, fonte e critério | Cópia local usada para continuar o trabalho |

Sincronizar um relatório guardado não significa atualizar suas métricas no Mercado Livre. Confira o período e a data da consulta; **Atualizar dados de Ads** tem outra finalidade.

<a id="conflitos"></a>

### Resolver conflitos em produtos, kits e conciliações de Ads

Edições em cadastros diferentes são combinadas automaticamente. Se duas pessoas mudarem o mesmo cadastro de formas diferentes, o painel pede revisão, mesmo que tenham alterado campos diferentes. Uma exclusão feita ao mesmo tempo que uma edição também pode exigir escolha.

1. Procure o bloco **Catálogo da empresa** em qualquer uma das três telas.
2. Clique em **Revisar alterações**. Esse botão aparece quando há conflito ou primeira associação pendente; ficar oculto quando tudo está sincronizado é normal.
3. Confira cada registro e compare **Minha edição** com **Versão da empresa**. A primeira é a versão deste navegador; a segunda é a versão compartilhada apresentada para a conferência. Os nomes não identificam qual funcionário fez a alteração.
4. Marque uma opção para **cada** registro em conflito. A escolha mantém o cadastro inteiro daquela versão: não combina automaticamente campos isolados, não soma despesas e não calcula uma média entre as opções.
5. Clique em **Salvar escolhas e sincronizar**. Aguarde **Catálogo sincronizado com a empresa**. Se outra pessoa salvar nesse intervalo, pode ser necessária uma nova conferência.
6. Confira o cadastro escolhido. Nos demais aparelhos, aguarde a atualização ou use **Sincronizar agora**.

| Tipo de conflito | O que conferir antes de escolher |
|---|---|
| **Produto** | Nome, custo, margem desejada e Ads de cada marketplace apresentados na revisão. A versão escolhida também carrega seus outros dados, taxas, vínculo e cotação. Confira os kits que usam esse produto: mudanças no custo ou peso do componente podem alterar seus resultados. |
| **Kit** | Nome, quantidade de componentes e meta apresentados no resumo. Confirme também produtos, quantidades, custos adicionais e parâmetros próprios da versão que pretende manter. O resumo do diálogo não mostra todos esses detalhes. Uma escolha não pode deixar um kit sem seus produtos componentes. |
| **Conciliação de Ads** | Anúncio, datas, receita, custo dos produtos, tarifas, impostos, frete, outras despesas, fonte e escopo — somente diretas ou diretas e indiretas. Escolha a conferência correta daquele anúncio e período; não some duas versões da mesma conciliação. |

**Exemplo fictício:** um funcionário salva o custo de um produto como R$ 12,00 e outro salva R$ 13,00 a partir da versão anterior. O painel pede uma escolha; o último clique em Salvar não garante que sua versão substitua a do colega. O mesmo vale para duas margens diferentes no mesmo kit ou duas apurações diferentes do mesmo anúncio e período.

Se o resumo não mostrar a diferença necessária ou você não souber qual valor está correto, clique em **Fechar** e confira com o colega ou responsável. Fechar não aplica escolhas nem resolve o conflito; a edição local permanece pendente.

**Usar somente o catálogo da empresa** se aplica à base compartilhada completa apresentada na revisão, não apenas ao registro selecionado. Para resolver diferenças pontuais, escolha uma versão por registro e use **Salvar escolhas e sincronizar**.

Se aparecer **A escolha deixa um kit sem seus componentes**, revise as escolhas dos produtos e do kit para manter uma combinação válida. Se os dados locais mudarem durante a revisão, confira novamente as opções. Se não for possível guardar a cópia anterior, libere espaço no navegador ou baixe um backup antes de continuar.

Conciliações de anúncios ou períodos diferentes são mantidas separadamente. Compartilhar uma conciliação não elimina a conferência financeira: se a evidência de Ads mudar, revise a apuração na Gestão de Ads antes de considerar o lucro conciliado. Veja [como conciliar o lucro apurado](#conciliar-lucro).

### Backup e desconexão no trabalho compartilhado

Desconectar o Mercado Livre mantém a cópia local e encerra o acesso à sincronização nesse navegador. Conecte novamente a conta autorizada para voltar à base da empresa.

O backup JSON permanece como cópia independente. No modo local, ele também permite transferir o catálogo entre aparelhos. **Restaurar um backup com compartilhamento ativo pode substituir os cadastros da empresa após a sincronização**; confira o arquivo e combine essa operação com a equipe.

Se aparecer **Dados só nesta sessão**, baixe um backup antes de fechar a página. Veja [como fazer e restaurar backups](#backup).

<a id="telas"></a>

## 2. Conhecer as telas

Use o **menu lateral** para acessar as três telas do painel. O quarto atalho, **Manual do usuário**, abre este documento no GitHub.

| Tela | Para que serve |
|---|---|
| **Meus produtos** | Cadastrar, pesquisar, ordenar e comparar os preços e lucros dos produtos; importar CSV, exportar e fazer backup. |
| **Montar kits** | Selecionar produtos e quantidades, calcular o conjunto e guardar kits. |
| **Gestão de Ads** | Consultar investimento e atribuição, comparar períodos, projetar cenários e conciliar lucro. |

<a id="menu-computador"></a>

### Recolher e expandir o menu no computador

Em uma janela larga, o menu fica ao lado do conteúdo. Para ganhar espaço na tela:

1. No cabeçalho do menu, junto à marca Conduz Cobre, clique no botão com seta **Recolher menu lateral**.
2. O menu passa a mostrar somente os ícones. Os quatro atalhos continuam disponíveis: **Meus produtos**, **Montar kits**, **Gestão de Ads** e **Manual do usuário**.
3. Passe o mouse sobre um ícone para ver o nome do atalho. Pelo teclado, use **Tab** para chegar ao ícone e **Enter** para abri-lo; o nome também aparece ao receber o foco. O destaque indica a tela selecionada.
4. Para voltar aos nomes completos, clique no botão com seta **Expandir menu lateral**. Também é possível chegar a esse botão com **Tab** e acioná-lo com **Enter**.

Recolher ou expandir mantém a tela atual e os campos já preenchidos no formulário em andamento. Você pode usar esse controle em **Meus produtos**, **Montar kits** e **Gestão de Ads**.

<a id="preferencia-menu"></a>

### Como a preferência fica salva

Ao recolher ou expandir, o painel guarda a escolha automaticamente no armazenamento local do navegador. Não é preciso clicar em Salvar nem estar conectado ao Mercado Livre para guardar essa preferência.

| Situação | Comportamento do menu |
|---|---|
| Recarregar ou reabrir o mesmo endereço, no mesmo navegador e perfil | No computador, o menu volta ao estado escolhido: recolhido ou expandido. |
| Outro funcionário acessar o catálogo ou você abrir outro navegador, perfil ou aparelho | Cada navegador tem sua própria preferência de menu. |
| Sincronizar o catálogo ou baixar um backup do painel | A preferência do menu não é compartilhada pela nuvem nem incluída no backup. |
| Limpar os dados do site ou encerrar uma sessão privada | A preferência pode ser perdida; sem uma escolha salva, o menu do computador começa expandido. |
| O navegador bloquear o armazenamento local | O botão continua funcionando durante o uso, mas a escolha pode não permanecer ao recarregar. |

Essa escolha muda apenas a apresentação do menu. Os produtos, kits, relatórios, conciliações e cálculos continuam com seus próprios dados e regras de sincronização.

<a id="menu-celular"></a>

### Usar o menu no celular

No celular e em janelas menores, o menu fica fechado para liberar espaço:

1. Toque em **Menu** para abrir o menu lateral.
2. Os quatro atalhos aparecem com os **nomes completos**, mesmo que você tenha deixado o menu recolhido no computador ou recarregado a página no tamanho de celular.
3. Toque em **Meus produtos**, **Montar kits** ou **Gestão de Ads** para abrir a tela escolhida. O menu fecha após a seleção. **Manual do usuário** abre o GitHub em uma nova aba e também fecha o menu.
4. Para fechar sem trocar de tela, toque em **Fechar menu** ou fora do menu. Com um teclado conectado, também é possível usar **Escape**.

O botão de recolher para somente ícones aparece apenas no modo de computador. Usar o menu no celular não apaga a preferência salva: ao voltar a uma janela larga no mesmo navegador e perfil, o painel retoma o estado recolhido ou expandido escolhido antes.

### Abrir o manual pelo painel

O atalho **Manual do usuário** fica disponível nas três telas, inclusive quando o menu do computador mostra somente ícones. Ele não exige conexão com o Mercado Livre. O documento abre no GitHub em uma nova aba e a aba do painel permanece aberta, com a tela e os campos em andamento. Ler o manual no GitHub exige internet.

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

<a id="buscar-produtos"></a>

### Buscar produtos

No computador, abra **Meus produtos** e use o campo **Buscar produto ou categoria**, acima dos cartões:

1. Digite parte do **nome**, da **categoria** ou do **ID MLB do anúncio vinculado**. Por exemplo, `disjuntor` encontra nomes que contêm esse trecho. Para buscar pelo ID, use o número com o prefixo `MLB` que aparece no vínculo do produto.
2. A lista é filtrada enquanto você digita; não é preciso apertar Enter ou clicar em um botão de pesquisa.
3. Confira o contador abaixo da lista. **1 de 3 produtos**, por exemplo, significa que um cadastro corresponde à busca e o catálogo tem três produtos.
4. Para voltar ao catálogo completo, apague todo o conteúdo do campo de busca.

A pesquisa aceita maiúsculas e minúsculas e ignora espaços no início e no fim do texto. Os acentos são considerados: se não encontrar um produto, confira a grafia do cadastro ou pesquise outro trecho do nome. O filtro procura nos produtos já cadastrados no painel; o [catálogo de anúncios do Mercado Livre](#mercado-livre) tem sua própria busca, usada ao vincular um anúncio.

Se aparecer **Nenhum produto corresponde à busca**, **Exportar CSV** fica desativado no computador e no celular. Ao limpar a busca, os produtos cadastrados voltam à lista e o botão é reativado automaticamente. Os cadastros continuam guardados. Veja [como reativar a exportação](#exportar-csv-desativado).

<a id="ordenar-produtos"></a>

### Ordenar produtos

No computador, os controles de ordenação ficam acima dos cartões, junto à busca:

1. Em **Ordenar por**, escolha o critério desejado na tabela abaixo.
2. Confira o botão de direção: **↑ Crescente** mostra os menores valores primeiro; **↓ Decrescente** mostra os maiores primeiro. Para nome, a ordem é alfabética ou alfabética inversa.
3. Clique nesse botão para inverter a direção. Ao escolher outro critério, a direção atual é mantida; confira o texto do botão antes de comparar os resultados.

| Opção em Ordenar por | Valor utilizado |
|---|---|
| **Nome** | Nome do produto, em ordem alfabética. |
| **Custo** | Custo de uma unidade informado no cadastro. |
| **Peso** | Peso em quilogramas informado no cadastro. |
| **Margem** | Margem desejada cadastrada, usada como meta de precificação. Não é o percentual de lucro calculado no cartão. |
| **ML Clássico** | Preço de venda exibido no cartão do Mercado Livre Clássico. |
| **ML Premium** | Preço de venda exibido no cartão do Mercado Livre Premium. |
| **Preço na Shopee** | Preço de venda exibido no cartão da Shopee. |

Nos cartões do Mercado Livre, o preço pode ser o **atual do anúncio vinculado** ou o **sugerido**, conforme a modalidade e os dados disponíveis. Produtos com valores iguais ficam empatados no critério escolhido.

Você pode combinar busca e ordenação: primeiro filtre os produtos, depois escolha o critério e a direção. Apenas os resultados encontrados são ordenados. **Exportar CSV** usa os produtos visíveis na ordem apresentada; para incluir todos, limpe a busca antes de exportar.

<a id="busca-ordenacao-celular"></a>

### Usar busca e ordenação no celular

1. Toque em **Menu** e escolha **Meus produtos**.
2. Acima da lista de cartões, toque em **Buscar produto ou categoria** e digite o nome, a categoria ou o ID MLB vinculado. Os resultados aparecem enquanto você digita.
3. Toque em **Ordenar por** e escolha uma das mesmas sete opções disponíveis no computador.
4. Toque em **↑ Crescente** ou **↓ Decrescente** para inverter a ordem. A busca permanece aplicada ao mudar o critério ou a direção.
5. Para exibir todos os produtos novamente, apague o texto da busca. Se quiser voltar à ordem alfabética, escolha **Nome** e deixe o botão em **↑ Crescente**.

Os controles se adaptam à largura da tela e os produtos aparecem em cartões. Busca e ordenação mudam apenas a apresentação da lista, preservando os valores cadastrados.

### Encontrar, editar e excluir

Use a [busca](#buscar-produtos) e a [ordenação](#ordenar-produtos) para localizar o cadastro que deseja ajustar.

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

<a id="importar-conferir-catalogo"></a>

### Importar e conferir o catálogo completo

Depois de entrar e clicar em **Prosseguir**, o painel carrega o catálogo compartilhado e busca automaticamente todos os anúncios que a API disponibiliza para a conta conectada. Não há botão de buscar anúncios para iniciar essa importação.

**Importação automática:** acompanhe o aviso em **Conexão com o Mercado Livre**. A rotina percorre os lotes até o fim, consulta o preço oficial disponível e adiciona somente anúncios ainda não vinculados a um produto nem presentes nas pendências. Não usa nomes iguais para juntar produtos. Novos anúncios ficam em **Anúncios pendentes de cadastro**, sem custo inventado. Custos, margens, nomes internos, pesos, impostos, taxas, serviços, Ads, kits e conciliações existentes são preservados.

A busca acontece uma vez por abertura autenticada da página; recarregar inicia uma nova conferência de anúncios novos, sem duplicar as pendências existentes. A rotina aguarda a confirmação do catálogo da empresa e o fim de formulários em edição antes de aplicar inclusões. Falhas são mostradas no aviso e têm novas tentativas limitadas; os dados anteriores são preservados. Aguarde a sincronização para os colegas receberem as pendências na nuvem.

**Conferir atualizações dos produtos já cadastrados:**

1. Em **Meus produtos → Conexão com o Mercado Livre**, use **Conferir catálogo**. A consulta da revisão começa ao abrir, sem outro botão de busca. Se uma consulta automática estiver em andamento, aguarde sua conclusão.
2. Use **Pesquisar na revisão** por nome, MLB ou SKU e o filtro **Mostrar**. A busca considera todas as páginas consultadas.
3. Nos produtos cadastrados, compare nome, categoria, peso e preço registrado com os dados consultados. O vínculo pelo MLB e conta identifica o cadastro. Nome e categoria internos, custo, peso, margem, imposto, Ads e serviços existentes são preservados.
4. Confira o lucro estimado no preço atual e as sugestões dos três canais. Para produtos que já usam tarifas oficiais, a consulta refaz as cotações com os parâmetros preservados. No modo manual, as taxas e o modo salvos são mantidos. A automação existente de Ads continua responsável por atualizar o percentual quando houver histórico aplicável.
5. Marque os resultados desejados ou use **Selecionar resultados disponíveis**. Esse comando inclui todas as páginas do filtro atual; **Desmarcar todos** limpa a seleção inteira. Nenhum resultado começa marcado.
6. Use **Salvar selecionados** para aplicar somente a revisão marcada. Fechar ou cancelar descarta as propostas da revisão; não desfaz pendências que já foram incluídas pela importação automática.
7. Aguarde **Catálogo sincronizado com a empresa**. Alterações simultâneas continuam usando a revisão de conflitos do catálogo compartilhado.

No celular, abra **Meus produtos** pelo **Menu** e siga os mesmos comandos. Os resultados aparecem em cartões e os filtros se adaptam à largura da tela.

**Anúncios sem custo:** são adicionados automaticamente em **Anúncios pendentes de cadastro**. Essa lista é compartilhada com a empresa e incluída no backup v19. Pendências não entram no lucro médio, nos kits nem no CSV de produtos. Use a busca e a paginação da própria lista para encontrá-las.

Para concluir uma pendência, clique em **Concluir cadastro**, informe o custo de compra e confira peso, margem, impostos e Ads no cadastro habitual. O custo começa vazio. A pendência só vira produto calculado após **Salvar produto** com dados válidos; cancelar mantém a pendência. Ao salvar, o painel remove a pendência correspondente e preserva os demais registros. Os custos e impostos da empresa não são deduzidos do preço anunciado pelo Mercado Livre.

**Resultados indisponíveis e variações:** falhas de preço, frete ou cotação aparecem explicitamente e não podem ser selecionadas. Anúncios que não retornarem na listagem mantêm seus cadastros. Anúncios com variações podem ter preços e custos diferentes por unidade: os cadastros existentes exigem revisão individual e não são atualizados automaticamente em lote; anúncios novos permanecem pendentes para conferência. A rotina trabalha por anúncio, sem criar automaticamente um produto para cada variação.

Uma falha durante a listagem impede salvar uma revisão incompleta; tente buscar novamente. Se a listagem terminar, mas algumas consultas individuais falharem, os resultados disponíveis podem ser selecionados e os demais permanecem preservados. Os limites desta versão são 10.000 anúncios por consulta, 5.000 produtos e 5.000 pendências salvas, além do limite de tamanho do catálogo. A conexão precisa continuar válida; trocar de conta invalida a revisão.

Os valores do anúncio são referências consultadas, e os lucros apresentados são estimativas por venda com seus custos e impostos cadastrados. Essa função não substitui a conciliação dos resultados efetivamente cobrados nas vendas e não altera anúncios no Mercado Livre.

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

O kit guarda suas taxas e sua cotação. Os custos e pesos dos componentes continuam acompanhando o catálogo. Se uma mudança nos componentes tornar a cotação incompatível, [atualize a cotação do próprio kit](#atualizar-cotacao-kit) antes de usar as sugestões. Para modificar o conjunto, use **Editar kit**. **Limpar / novo kit** limpa a montagem em edição para iniciar outra.

Os kits montados mantêm Ads manual. O anúncio usado como referência logística não identifica publicidade do kit. Para acompanhar um kit que já possui anúncio próprio, cadastre-o como produto e vincule esse anúncio.

<a id="atualizar-cotacao-kit"></a>

### Atualizar a cotação quando o custo dos componentes mudar

Quando o custo de um produto componente muda, o kit passa a somar esse novo custo. Uma cotação oficial calculada com o custo anterior pode deixar de servir: os cartões do Mercado Livre mostram **Recalcular** e **Atualize a cotação: os dados mudaram.** Isso evita apresentar como válida uma sugestão baseada em parâmetros antigos.

1. Em **Meus produtos**, confira se o novo custo do componente já foi salvo. Com o catálogo compartilhado ativo, aguarde **Catálogo sincronizado com a empresa** antes de atualizar o kit.
2. Abra **Montar kits** pelo menu lateral e localize o conjunto em **Meus kits salvos**. Confira os componentes e as quantidades, principalmente quando dois kits tiverem o mesmo nome.
3. Clique em **Editar kit** nesse conjunto. Mantenha a **Margem desejada (%)** que já estava salva, além dos componentes, quantidades, Ads de cada marketplace e custo adicional.
4. Mantenha **Calcular frete e comissões oficiais para este kit** marcado, com a categoria, a referência de logística e as medidas já cadastradas. A consulta pode começar automaticamente ao abrir a edição; use **Atualizar cotação** para refazê-la quando necessário. Aguarde a confirmação da consulta.
5. Confira **Custo dos produtos**, peso, preços sugeridos e **Lucros**. No celular e em janelas menores, abra a aba **Preços**. Em **Ver custos e taxas**, confira o frete e a comissão aplicados a cada modalidade, além do imposto preservado do kit.
6. Clique em **Salvar kit** para gravar a cotação no mesmo cadastro. Se estiver na aba **Preços**, volte à aba **Montagem** para encontrar o botão. **Limpar / novo kit** inicia outra montagem; não é o comando para atualizar um kit salvo.
7. Com compartilhamento ativo, aguarde **Catálogo sincronizado com a empresa**. Se houver conflito, siga as [instruções de revisão de alterações](#conflitos) antes de considerar a atualização concluída.
8. Recarregue a página, volte a **Montar kits** e confira o cartão em **Meus kits salvos**: custo atual dos componentes, mesma margem desejada e nova cotação preservada. A conferência pode ser feita no cartão, sem abrir outra edição.

**Manter a margem:** a atualização recalcula os preços para buscar a meta existente. Em um exemplo ilustrativo, se o custo total passar de R$ 50,00 para R$ 54,00 e a meta for 20%, mantenha **20** no campo de margem e consulte novamente. O lucro efetivo pode ficar ligeiramente acima da meta pelo arredondamento dos preços. O frete e a comissão são consultados para o conjunto e para cada preço simulado; Clássico, Premium e a referência para 10% podem usar fretes diferentes.

**Preservar os demais cadastros:** salvar essa cotação atualiza somente o kit em edição. Os produtos individuais, outros kits, taxas gerais e conciliações de Ads não são editados por essa ação. Outros kits que também usam um componente cujo custo já mudou devem ser conferidos separadamente; suas cotações não são renovadas ao salvar este kit. A Shopee recalcula o preço com o custo atual; confira suas taxas e serviços em **Ver custos e taxas**, conforme as [regras da Shopee](#tarifas). Em cadastros com taxas legadas, a edição prepara a política incorporada atual ao salvar esse registro.

Se a consulta falhar ou os cartões continuarem pedindo **Recalcular**, confira a conexão com a conta correta, a categoria, a referência de logística e a mensagem exibida. Aguarde uma cotação válida antes de salvar no modo oficial. Durante a navegação, a automação de Ads pode renovar a data das consultas dos produtos; isso é independente da atualização do kit.

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

<a id="exportar-produtos-filtrados"></a>

### Exportar produtos filtrados em CSV

Em **Meus produtos**, **Exportar CSV** baixa somente os produtos que correspondem à busca, na ordem escolhida em **Ordenar por** e no botão de direção. O filtro vale para todos os resultados da lista, inclusive os cartões mais abaixo na página. Cada linha de dados do arquivo corresponde a um produto, além da linha de cabeçalhos.

<a id="exportar-csv-computador"></a>

#### Exportar no computador

1. Abra **Meus produtos** pelo menu lateral.
2. Em **Buscar produto ou categoria**, digite parte do nome, da categoria ou do ID MLB vinculado. A lista é filtrada enquanto você digita.
3. Em **Ordenar por**, escolha o critério desejado, como **Nome**, **Custo** ou o preço de um marketplace. Confira os [sete critérios disponíveis](#ordenar-produtos).
4. Ajuste o botão para **↑ Crescente** ou **↓ Decrescente**. Ao trocar o critério, a direção atual é mantida.
5. Confira os produtos, a sequência dos cartões e o contador abaixo da lista. **2 de 3 produtos**, por exemplo, significa que o CSV terá dois produtos, mesmo que o catálogo tenha três.
6. Clique em **Exportar CSV** e abra o arquivo baixado. Os nomes e a sequência das linhas seguem a lista no momento do clique. Se você limpou a busca, o arquivo inclui todos os produtos, mantendo o critério e a direção escolhidos.

<a id="exportar-csv-celular"></a>

#### Exportar no celular

1. Toque em **Menu** e escolha **Meus produtos**.
2. Acima dos cartões, toque em **Buscar produto ou categoria** e digite o filtro.
3. Toque em **Ordenar por** para escolher o critério e em **↑ Crescente** ou **↓ Decrescente** para definir a direção.
4. Confira os cartões encontrados e o contador de resultados.
5. Toque em **Exportar CSV**. O navegador baixa o arquivo ou apresenta as opções para salvá-lo; consulte a área de downloads do navegador para encontrá-lo.
6. Ao abrir o arquivo, confira se as linhas correspondem à lista e à ordem apresentada no painel. Com a busca limpa, todos os produtos são incluídos, mantendo o critério e a direção escolhidos no celular.

O comportamento é o mesmo nas duas telas: mudar a busca, o critério ou a direção antes de exportar determina o conteúdo do próximo CSV. O arquivo já baixado é uma cópia daquele momento; para receber outra seleção ou outra ordem, exporte novamente.

**Exemplo ilustrativo:** em um catálogo com **Cabo A**, **Cabo B** e **Tomada C**, a busca `cabo` deixa dois produtos. Com **Nome** e **↑ Crescente**, o CSV traz **Cabo A** e depois **Cabo B**. Com **↓ Decrescente**, traz **Cabo B** e depois **Cabo A**. **Tomada C** fica fora dos dois arquivos porque não corresponde à busca.

<a id="exportar-csv-trocar-buscas-validas"></a>

#### Exportar CSV ao trocar entre buscas válidas

No computador e no celular, substituir uma busca válida por outra válida atualiza os cartões e o conteúdo do próximo CSV. **O arquivo inclui somente os resultados da nova busca, na ordem escolhida**. O critério em **Ordenar por** e a direção **↑ Crescente** ou **↓ Decrescente** são mantidos. Com produtos encontrados na nova busca, **Exportar CSV** fica disponível.

**No computador:**

1. Em **Meus produtos**, faça uma busca válida em **Buscar produto ou categoria** e escolha o critério e a direção desejados.
2. Substitua o texto por outra busca que também encontre produtos. Não é necessário limpar o campo em uma etapa separada nem apertar Enter.
3. Confira os novos cartões e sua sequência. Mesmo que o contador continue igual, como **2 de 3 produtos**, os nomes encontrados podem ter mudado.
4. Clique em **Exportar CSV** e abra o arquivo baixado. Os nomes e a ordem das linhas correspondem à nova lista filtrada, além da linha de cabeçalhos.

**No celular:**

1. Toque em **Menu**, escolha **Meus produtos** e faça uma busca válida em **Buscar produto ou categoria**. Escolha o critério em **Ordenar por** e a direção crescente ou decrescente.
2. Toque no campo de busca e substitua o texto por outra busca válida.
3. Confira os novos cartões, o contador e a ordem apresentada. A troca da busca mantém o critério e a direção escolhidos no celular.
4. Toque em **Exportar CSV** e confira o arquivo na área de downloads do navegador. Ele contém somente os novos resultados, inclusive os cartões mais abaixo na página, na ordem da lista.

Um produto da busca anterior só permanece no CSV se também corresponder à nova busca. **Exemplo ilustrativo:** em um catálogo com **Cabo A**, **Cabo B**, **Tomada C** e **Tomada D**, trocar `cabo` por `tomada`, com **Nome** e **↓ Decrescente**, gera um CSV com **Tomada D** e depois **Tomada C**. Os dois cabos ficam fora desse novo arquivo.

Trocar a busca não baixa um arquivo automaticamente nem modifica os CSVs já baixados: clique ou toque em **Exportar CSV** para gerar a seleção atual. Se a nova busca não encontrar produtos, o [botão fica desativado](#exportar-csv-busca-sem-resultados). Buscar, ordenar e exportar preservam os cadastros e suas configurações.

<a id="exportar-csv-desativado"></a>

#### Quando Exportar CSV fica desativado

No computador e no celular, uma busca sem resultados mantém **Exportar CSV** visível, mas **desativado**. A lista mostra **Nenhum produto corresponde à busca** e um contador como **0 de 3 produtos**. Isso significa que nenhum cadastro corresponde ao filtro; os produtos continuam salvos.

Você pode [substituir a busca por uma válida](#exportar-csv-busca-valida) para exportar somente os produtos encontrados, ou limpar a busca para exportar todos, conforme os passos abaixo.

Para reativar o botão e exportar todos os produtos na ordem escolhida, siga os passos da sua tela.

**No computador:**

1. Em **Meus produtos**, clique em **Buscar produto ou categoria** e apague todo o texto da busca sem resultados.
2. Os produtos cadastrados reaparecem, o contador volta a mostrar a lista completa, como **3 de 3 produtos**, e **Exportar CSV é reativado automaticamente**.
3. Confira **Ordenar por** e **↑ Crescente** ou **↓ Decrescente**. O critério e a direção que você escolheu antes de limpar a busca são mantidos.
4. Clique em **Exportar CSV**. O arquivo baixado inclui todos os produtos, na mesma sequência dos cartões, além da linha de cabeçalhos.

**No celular:**

1. Se estiver em outra tela, toque em **Menu** e escolha **Meus produtos**. Toque em **Buscar produto ou categoria** e apague todo o texto da busca sem resultados.
2. Confira se todos os cartões reapareceram e se o contador mostra a lista completa, como **3 de 3 produtos**. **Exportar CSV é reativado automaticamente**.
3. Confira **Ordenar por** e **↑ Crescente** ou **↓ Decrescente**. Limpar a busca mantém o critério e a direção escolhidos no celular.
4. Toque em **Exportar CSV** e confira o arquivo na área de downloads do navegador. Ele inclui todos os produtos na ordem apresentada, inclusive os cartões mais abaixo na página.

**Limpar a busca reativa o botão, mas não inicia o download.** Clique ou toque em **Exportar CSV** para gerar o arquivo completo. Por exemplo, com **Peso** e **↑ Crescente**, todos os produtos são exportados do menor para o maior peso; com **ML Clássico** e **↓ Decrescente**, do maior para o menor preço desse marketplace. Limpar a busca e exportar preservam os cadastros e suas configurações.

Se o catálogo estiver vazio, com **0 de 0 produtos**, limpar a busca não cria resultados: é preciso cadastrar produtos ou carregar o catálogo da empresa para exportar.

<a id="exportar-csv-busca-sem-resultados"></a>

#### Desativar CSV ao trocar por uma busca sem resultados

No computador e no celular, **trocar uma busca válida por outra sem resultados desativa automaticamente Exportar CSV**, mesmo que o botão estivesse disponível para os resultados anteriores. Ele permanece visível, mas não pode ser acionado enquanto a busca não encontrar produtos.

**No computador:**

1. Em **Meus produtos**, use **Buscar produto ou categoria** para encontrar produtos. Confira os cartões, um contador como **2 de 3 produtos** e o botão **Exportar CSV** disponível.
2. Substitua o texto por uma busca que não corresponda a nenhum produto. A lista muda enquanto você digita; não é preciso apertar Enter.
3. Confira **Nenhum produto corresponde à busca**, o contador **0 de 3 produtos**, neste exemplo, e **Exportar CSV desativado**.

**No celular:**

1. Toque em **Menu**, escolha **Meus produtos** e faça uma busca válida em **Buscar produto ou categoria**. Com produtos encontrados, **Exportar CSV** fica disponível.
2. Toque no campo e substitua o texto por uma busca sem resultados.
3. Os cartões desaparecem da lista filtrada, aparece **Nenhum produto corresponde à busca** e o contador passa a **0 de 3 produtos**, neste exemplo. **Exportar CSV permanece visível e fica desativado**.

A lista vazia representa somente o resultado do filtro: **os produtos continuam cadastrados**. A troca da busca também preserva o critério em **Ordenar por**, a direção crescente ou decrescente e as configurações dos produtos. Para voltar a exportar, [substitua a busca por uma válida](#exportar-csv-busca-valida) ou [limpe a busca para incluir todos os produtos](#exportar-todos-produtos).

<a id="exportar-csv-busca-valida"></a>

#### Reativar CSV ao trocar por uma busca válida

No computador e no celular, você pode substituir uma busca sem resultados por outra que encontre produtos. **Exportar CSV é reativado automaticamente** assim que houver resultados. O critério em **Ordenar por** e a direção **↑ Crescente** ou **↓ Decrescente** são mantidos. Ao exportar, o arquivo inclui **somente os produtos encontrados**, nessa ordem.

**No computador:**

1. Em **Meus produtos**, clique em **Buscar produto ou categoria** e substitua o texto da busca sem resultados por parte de um nome, categoria ou ID MLB vinculado. Não é necessário limpar a busca em uma etapa separada nem apertar Enter.
2. Confira os cartões e o contador. **2 de 3 produtos**, por exemplo, significa que o CSV terá dois produtos; o terceiro permanece cadastrado e fica fora do arquivo porque não corresponde à busca. O botão **Exportar CSV** volta a ficar disponível.
3. Confira **Ordenar por** e **↑ Crescente** ou **↓ Decrescente**. Trocar o texto da busca preserva o critério e a direção que estavam selecionados.
4. Clique em **Exportar CSV** e abra o arquivo baixado. As linhas seguem os resultados e a sequência dos cartões, além da linha de cabeçalhos.

**No celular:**

1. Se estiver em outra tela, toque em **Menu** e escolha **Meus produtos**. Em **Buscar produto ou categoria**, substitua o texto sem resultados por uma busca válida.
2. Confira os cartões encontrados e o contador, como **2 de 3 produtos**. **Exportar CSV** é reativado automaticamente; os demais produtos continuam salvos, fora da seleção.
3. Confira **Ordenar por** e **↑ Crescente** ou **↓ Decrescente**. O critério e a direção escolhidos no celular são mantidos ao trocar a busca.
4. Toque em **Exportar CSV** e confira o arquivo na área de downloads do navegador. Ele inclui todos os resultados do filtro, inclusive os cartões mais abaixo na página, na mesma ordem da lista.

**Exemplo ilustrativo:** em um catálogo com **Cabo A**, **Cabo B** e **Tomada C**, uma busca que não corresponde a nenhum produto desativa o botão. Substituí-la por `cabo` faz o botão voltar a funcionar. Com **Nome** e **↓ Decrescente**, o CSV traz **Cabo B** e depois **Cabo A**; **Tomada C** fica fora do arquivo.

Trocar a busca reativa o botão, mas não inicia o download: clique ou toque em **Exportar CSV** para gerar o arquivo com a seleção atual. Se a nova busca também não encontrar produtos, o botão continua desativado. Para [exportar o catálogo completo](#exportar-todos-produtos), apague todo o texto da busca. Pesquisar, ordenar e exportar preservam os cadastros e suas configurações.

<a id="exportar-todos-produtos"></a>

#### Exportar todos ao limpar a busca

No computador e no celular, **limpar a busca restaura todos os produtos e mantém a ordenação selecionada**. O critério em **Ordenar por** e o sentido **↑ Crescente** ou **↓ Decrescente** continuam valendo para a lista completa e para o próximo CSV. Isso também vale quando a busca anterior não encontrou nenhum produto: o botão é reativado automaticamente e, ao clicar ou tocar nele, você exporta o catálogo completo nessa ordem. Veja o [passo a passo de reativação no computador e no celular](#exportar-csv-desativado).

1. Escolha o critério e a direção desejados, ou mantenha os que já estão selecionados.
2. Apague todo o conteúdo de **Buscar produto ou categoria**.
3. Confira se o contador mostra o catálogo completo, por exemplo **3 de 3 produtos**, e se a sequência dos cartões corresponde à ordem escolhida.
4. Clique ou toque em **Exportar CSV**. O arquivo terá todos os produtos nessa sequência, além da linha de cabeçalhos.

No exemplo de **Cabo A**, **Cabo B** e **Tomada C**, apagar a busca `cabo` faz **Tomada C** voltar à lista e ao próximo CSV. Com **Nome** e **↑ Crescente**, o arquivo traz **Cabo A**, **Cabo B** e **Tomada C**. Se a direção escolhida for **↓ Decrescente**, traz **Tomada C**, **Cabo B** e **Cabo A**.

O CSV já baixado permanece como estava: clique ou toque novamente em **Exportar CSV** depois de limpar a busca para gerar o arquivo completo. Limpar a busca e exportar preservam os cadastros e suas configurações no painel. Se a busca não tiver resultados, o botão fica desativado; ajuste ou limpe a pesquisa.

O arquivo reúne preços, lucros, mínimos para 10%, Ads, taxas, origem das consultas e classificações. Alguns cabeçalhos conservam o termo técnico “margem efetiva”; ele corresponde ao percentual calculado de lucro sobre o preço.

O nome do arquivo segue o padrão `precos-marketplaces-AAAA-MM-DD.csv`. Ao importar em um programa de planilhas, use **UTF-8** e **ponto e vírgula (`;`)** como separador de colunas. Os números usam vírgula decimal. Esses parâmetros mantêm os acentos e os valores nas colunas corretas.

A exportação preserva os produtos e suas configurações no painel. Para recuperar todos os produtos, kits e configurações em outro navegador, use o [backup JSON](#backup). Na **Gestão de Ads**, o botão **Exportar CSV** pertence ao comparativo e exporta seus próprios resultados filtrados, conforme as [instruções da Gestão de Ads](#ads).

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

**A restauração substitui o estado local atual.** Com o catálogo compartilhado ativo, a mudança também será sincronizada com a empresa e passará pela conferência de versão. A restauração não mescla cadastros. Arquivos inválidos não são aplicados. Backups antigos compatíveis são aceitos, mas não recebem métricas históricas que nunca foram registradas. Esta versão gera backup v19 e aceita backups das versões anteriores.

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

Conciliações de anúncios ou períodos diferentes são combinadas. Se dois funcionários alterarem a mesma conciliação com valores diferentes, o painel pede **Revisar alterações**, no bloco Catálogo da empresa, visível também na Gestão de Ads. Siga o [passo a passo de conflitos](#conflitos) e confira receita, despesas, escopo e fonte antes de escolher a versão. Esse botão resolve diferenças entre as cópias dos funcionários; **Revisar conciliação** abre a conferência financeira de um período. Compartilhar uma conciliação não elimina a necessidade de rever os valores quando a evidência de Ads mudar.

Os backups v19 incluem os relatórios arquivados, resumos e conciliações. Backups anteriores continuam aceitos e não apagam os arquivos de Ads já compartilhados. Se uma aba antiga pedir atualização, recarregue a página para usar a sincronização atual.

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

<a id="conciliar-lucro"></a>

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
| “Exportar CSV está desativado.” | Confira se a busca retornou zero produtos. Isso também acontece ao [trocar uma busca válida por outra sem resultados](#exportar-csv-busca-sem-resultados). Em Buscar produto ou categoria, [troque por uma busca válida](#exportar-csv-busca-valida) para exportar somente os encontrados, ou [apague a busca](#exportar-csv-desativado) para exportar todos. Quando houver resultados, o botão será reativado automaticamente no computador e no celular. Clique ou toque em Exportar CSV para baixar a seleção, mantendo o critério e a direção escolhidos em Ordenar por. |
| “O CSV trouxe menos produtos ou uma ordem diferente da que eu esperava.” | Confira a busca, o critério em Ordenar por e o botão Crescente/Decrescente antes do download. Ao [trocar entre buscas válidas](#exportar-csv-trocar-buscas-validas), o próximo CSV usa somente os novos resultados, mantendo a ordenação escolhida. Para incluir todos, apague a busca: o critério e a direção são mantidos. Exporte novamente para baixar o catálogo completo nessa ordem. Veja [como exportar todos ao limpar a busca](#exportar-todos-produtos). |
| “A lista está vazia, mas há produtos cadastrados.” | Apague o conteúdo de Buscar produto ou categoria e confira o contador abaixo da lista. Verifique também os acentos e a grafia da pesquisa. Se espera cadastros feitos por um colega, confira a [sincronização do catálogo](#sincronizacao). |
| “Ordenar por Margem não acompanha as cores de risco.” | Margem usa a meta digitada no cadastro. As cores usam o lucro calculado sobre o preço de venda, conforme as [regras de lucros e cores](#precos). |
| “No computador, só aparecem ícones no menu.” | O menu está recolhido. Passe o mouse ou use Tab para identificar os atalhos. Clique na seta Expandir menu lateral para mostrar os nomes, conforme as [instruções do computador](#menu-computador). |
| “O menu não ficou recolhido depois de reabrir.” | Confira se abriu o mesmo endereço, navegador e perfil e se o armazenamento local está permitido. Limpar os dados do site ou encerrar uma sessão privada pode remover a escolha. Veja [como a preferência fica salva](#preferencia-menu). |
| “No celular, o menu mostra os nomes mesmo com a preferência de recolhimento salva.” | Esse é o comportamento esperado. Toque em Menu para acessar os quatro atalhos com os nomes completos. A preferência de somente ícones volta a ser aplicada em uma janela larga do mesmo navegador; veja as [instruções do celular](#menu-celular). |
| “Meu catálogo sumiu no celular.” | Confirme endereço e conexão com a conta permitida. Com compartilhamento ativo, sincronize; no modo local, restaure o backup correto. |
| “Meu colega ainda não recebeu a alteração.” | Confira se você clicou em Salvar e se aparece Catálogo sincronizado com a empresa. No outro aparelho, termine a edição em andamento e use Sincronizar agora com a mesma conta autorizada. |
| “Não aparece Revisar alterações.” | O botão fica oculto sem conflito ou primeira associação pendente. Confira a mensagem no bloco Catálogo da empresa, disponível nas três telas. |
| “Há alterações simultâneas no mesmo cadastro.” | Abra Revisar alterações e escolha uma versão por registro, conforme o [procedimento de conflitos](#conflitos). Repetir Salvar não resolve a divergência. |
| “A meta é 20%, mas aparece outro lucro.” | Veja se o cartão usa preço atual do anúncio. A meta determina a sugestão; o lucro usa o preço apresentado e seus custos. |
| “O frete não entrou abaixo de R$ 100.” | Confira se é o modo manual. O automático usa a cotação reconhecida e tem condições próprias. |
| “As comissões estão bloqueadas.” | Confira se o modo oficial está ativo. Nesse modo os campos mostram a consulta. |
| “Não consigo salvar a cotação.” | Confira conexão, valores obrigatórios e a mensagem de atualização pendente ou inviável. Refaça a consulta. |
| “O lucro do kit mudou” ou “Recalcular” nos cartões do kit. | Confira se custos, pesos ou quantidades dos componentes mudaram. Use o [passo a passo para atualizar a cotação do kit](#atualizar-cotacao-kit), mantendo a margem desejada e salvando somente o conjunto escolhido. |
| “Ads mudou sozinho.” | Produtos vinculados podem receber o ACOS real dos últimos 30 dias encerrados. Confira período, conta e última consulta. |
| “Tenho ROAS, mas não tenho TACOS.” | Confira Vendas em Leitura e os detalhes da base de pedidos. As fontes são diferentes. |
| “Meu total difere do Letzee ou de outro aplicativo.” | Compare anúncio, datas, fuso, atribuição, descontos, cancelamentos e base do faturamento. Não se presume igualdade entre metodologias. |
| “O anúncio não aparece na busca.” | Na seleção do catálogo, aguarde a leitura completa ou atualize. Na Gestão de Ads, confira se o produto já está cadastrado e vinculado à conta correta. |
| “A importação não aceita o CSV.” | Confira cabeçalho, separador, casas decimais e mensagens por linha. Corrija o arquivo e selecione-o novamente. |
| “Não consigo excluir um produto.” | Remova-o dos kits que o utilizam ou exclua esses kits primeiro. |
| “Aparece Dados só nesta sessão.” | Baixe um backup imediatamente e confira se o navegador permite armazenamento local. |
| “A conexão falhou ou expirou.” | Se for uma falha temporária, recupere a internet e aguarde a retomada; use Sincronizar agora quando estiver habilitado. Se a sessão expirou, conecte novamente o Mercado Livre. Para configuração ou acesso de outra conta, procure o responsável pela integração. |

<a id="rotina"></a>

## 12. Rotina sugerida

Ao começar, abra o endereço oficial, confira a conta autorizada e a mensagem de sincronização em Catálogo da empresa. Use Sincronizar agora se precisar conferir a base antes de trabalhar. Atualize os preços e Ads quando precisar de uma análise renovada. Revise os produtos em vermelho ou amarelo olhando também as despesas detalhadas.

Ao alterar custo ou embalagem, confira os kits afetados e refaça cotações pendentes. Na Gestão de Ads, leia o período e a cobertura da consulta antes dos totais. Para registrar lucro apurado, use despesas efetivas do mesmo período e guarde a fonte da conferência.

Ao terminar, salve os formulários, resolva eventuais conflitos e aguarde Catálogo sincronizado com a empresa. Os colegas recebem essa base sem importar arquivos. Guarde backups datados conforme a rotina combinada com a empresa; eles são uma cópia adicional, não uma etapa obrigatória para cada sincronização.

<a id="fontes"></a>

## 13. Fontes e referências

### Como este manual foi preparado

As instruções e os nomes dos controles foram conferidos nos [campos da interface](src/index.html), nas [regras e fluxos do painel](src/app.js), na [sincronização do catálogo](src/catalog-sync.js) e na consulta de [vendas](netlify/lib/ml-sales.mjs) e [regras financeiras](netlify/lib/ml-sales-rules.mjs). Consulte o [histórico do projeto](https://github.com/diegorodriguesccobre-eng/meu-painel-m/commits/main) para acompanhar as revisões. As faixas, arredondamentos, cores e limites de uso descritos representam esta implementação.

Os procedimentos de catálogo compartilhado foram conferidos também na [documentação da configuração](CONFIGURAR_CATALOGO.md) e nos [testes de recuperação e edições simultâneas](tests/catalog-resilience.test.cjs). A conferência visual usou a página publicada sem conexão com a conta e uma cópia idêntica com dados fictícios para os conflitos; não provocou conflitos nos cadastros reais.

As referências externas abaixo foram reunidas na edição anterior, a partir da documentação oficial disponível e de resultados indexados do Mercado Livre. Algumas páginas oficiais bloquearam a leitura direta, e as páginas da Shopee não disponibilizaram o conteúdo no acesso automatizado. Os valores incorporados de Shopee e da tabela alternativa de frete mantêm as datas de conferência indicadas. A atualização de 25/11/2026 trata do catálogo compartilhado e da resolução de conflitos; não declara uma nova validação dessas tabelas.

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
