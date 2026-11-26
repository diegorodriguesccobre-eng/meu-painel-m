# Catálogos compartilhados por empresa

O catálogo pode guardar **produtos, kits, configurações de taxas, relatórios e conciliações de Ads** no Cloudflare D1.
Os funcionários acessam a mesma base ao conectar a conta autorizada da empresa no
Mercado Livre. O cadastro manual em arquivo continua disponível com armazenamento local.

## Acesso e configuração

O Worker exige a sessão OAuth criptografada já usada pelo painel. Não há senha nova.
Cada navegador precisa conectar uma conta do Mercado Livre explicitamente permitida.
`CATALOG_SELLER_IDS` contém os IDs autorizados, separados por vírgula. Cada ID recebe
seu próprio catálogo no mesmo banco: produtos, kits, taxas, relatórios e conciliações
de uma empresa não são compartilhados com a outra.
Sem essa lista, a configuração anterior com apenas `CATALOG_SELLER_ID` continua válida.
Uma conta fora da configuração não recebe nem altera catálogos compartilhados.
Sem ID permitido ou sem binding D1, a sincronização permanece desativada.
Não há cadastro público, escolha do vendedor pelo cliente nem associação automática
da primeira conta que acessar o endereço.

O banco `conduz-cobre-catalogo` é vinculado como `CATALOG_DB` em `wrangler.jsonc`.
Para outra instalação, crie um D1 na conta que hospeda o Worker e use seu UUID no
binding. UUID do banco e ID do vendedor são identificadores; tokens e chaves não
devem aparecer no arquivo de configuração ou no GitHub.

Na configuração do Worker, acrescente o ID numérico correto, sem substituir os
secrets existentes do Mercado Livre:

```json
"vars": {
  "CATALOG_SELLER_ID": "ID_NUMERICO_DA_CONTA_ORIGINAL",
  "CATALOG_SELLER_IDS": "ID_NUMERICO_CONDUZ_COBRE,ID_NUMERICO_CONDUZ_ENERGIA"
}
```

Confirme o ID em `/api/ml/status`, no navegador conectado, dentro de `account.id`.
Não use o App ID como se fosse o ID do vendedor. O usuário do painel só precisa
conectar o Mercado Livre; configurar o ID é tarefa do responsável pela implantação.

Mantenha `CATALOG_SELLER_ID` com a conta original: ele também identifica a empresa
à qual pertence o catálogo local anterior à separação. Acrescente a nova empresa
à lista, preservando a conta original. Não use curingas nem libere a primeira conta
que fizer login automaticamente. Uma lista inválida desativa o serviço em vez de ampliar o acesso.

As consultas ao banco usam exclusivamente o ID da sessão OAuth validada. O cabeçalho
`X-Conduz-Catalog-Account` confere se a aba ainda está usando essa mesma conta; ele
não escolhe outro catálogo. Se a sessão mudar em outra aba, a operação é recusada
e o painel pede para recarregar, preservando a cópia local.

## Troca de empresa no navegador

Ao conectar outra conta, o painel guarda e carrega a cópia própria de cada empresa
em `margem.painel.v1.account.<sellerId>`. A preferência da última empresa fica em
`conduz.catalog.active-account.v1`. A chave antiga `margem.painel.v1` é mantida na
migração; os dados anteriores são associados à conta original, não à empresa nova.
Rascunhos de produtos preparados para a conexão também são separados por conta.

Uma empresa nova começa com catálogo próprio. Conectar a Conduz Energia não copia
os produtos, kits ou dados de Ads da Conduz Cobre. Concluir ou cancelar formulários
abertos é necessário antes de trocar de empresa na mesma página.

As abas do mesmo perfil de navegador compartilham a sessão do Mercado Livre. Para
usar as duas empresas simultaneamente, utilize perfis distintos do navegador.
Se trocar a sessão em um perfil, recarregue as outras abas antes de continuar.

As tabelas são criadas com a migração versionada:

```sh
npx wrangler d1 migrations apply conduz-cobre-catalogo --remote
npm run build
```

Publique pelo fluxo do GitHub já usado no projeto. O build não aplica migrações
remotas automaticamente. Antes de ativar, confira a migração e o binding da mesma conta.

## Primeira associação

Abra o painel no navegador que contém o catálogo principal e conecte o Mercado Livre.
Em **Catálogo da empresa**, use **Revisar alterações**. Confira as contagens antes
de combinar os produtos locais com a base compartilhada. IDs diferentes são
cadastros diferentes, mesmo com nome igual. Se houver divergência no mesmo cadastro,
escolha a versão desejada. Para utilizar apenas a base central, escolha
**Usar somente o catálogo da empresa**.

Antes de aplicar a revisão, uma cópia anterior em formato de backup é preservada
no armazenamento deste navegador, sob `conduz.catalog.before-sharing.<sellerId>`.
Ela não é publicada no GitHub. Se essa cópia não puder ser gravada, a substituição
é interrompida. O backup JSON baixável continua disponível como cópia independente.

Em um navegador novo, conecte a mesma conta autorizada. O catálogo da empresa é
carregado sem precisar importar ou exportar arquivos.

## Sincronização e edições simultâneas

- Mudanças são guardadas localmente e enviadas após uma pequena espera.
- A cópia central é conferida a cada minuto com a página visível, ao retornar à aba,
  ao recuperar a rede ou em **Sincronizar agora**. O painel evita aplicar atualizações
  externas durante a edição de produtos ou montagem de kits.
- Alterações em cadastros diferentes são combinadas. Alterações divergentes no mesmo
  produto, kit, configuração de taxas ou conciliação do mesmo anúncio/período exigem
  **Revisar alterações**.
- Exclusão concorrente com edição também exige revisão. Um kit não pode ficar sem
  os produtos componentes. Nesses casos, confira as versões e suas dependências.
- A versão esperada é conferida no servidor em uma transação. Uma gravação antiga
  recebe conflito, sem apagar a versão mais recente.
- Falhas de rede ou de limite do plano preservam a cópia local e mostram pendência;
  a interface só confirma sincronização após resposta do servidor.

O D1 guarda o catálogo em partes com verificação de integridade e mantém as duas
últimas revisões. Partes antigas são limpas apenas após uma gravação confirmada.
As partes de uma revisão são lidas e gravadas de forma transacional. Uma consulta
condicional sem mudanças evita transferir novamente todo o catálogo.

## O que é compartilhado

| Dado | Local de armazenamento |
|---|---|
| Produtos, custos, pesos, Ads de precificação, vínculos, taxas e cotações preservadas | Catálogo compartilhado e cópia no navegador |
| Métricas de Ads guardadas no próprio produto | Acompanham esse produto no catálogo |
| Kits, componentes, quantidades e parâmetros próprios | Catálogo compartilhado e cópia no navegador |
| Comparativos de períodos, resumos do anunciante e conciliações de lucro da Gestão de Ads | Catálogo compartilhado e cópia no navegador |
| Sessão do Mercado Livre | Cookie protegido no navegador; não é guardada no D1 |
| Chaves secretas da integração | Configuração privada do Worker |

Desconectar o Mercado Livre encerra o acesso à base central e mantém a cópia local.
Os quatro funcionários precisam usar sessões da conta autorizada; esta etapa não
identifica individualmente quem fez cada edição.

Restaurar um backup ou excluir um produto com sincronização ativa também altera o
catálogo compartilhado após a confirmação e a conferência de versão. Avise a equipe
antes de substituir o catálogo inteiro. Relatórios e conciliações compartilhados são
preservados ao combinar cópias antigas, sem interpretar ausência no navegador como exclusão.

## Relatórios e conciliações de Ads

Os comparativos são arquivados por conta, data-base e duração dos períodos. Relatórios
distintos são mantidos; anúncios de um mesmo relatório são combinados sem somar de
novo suas métricas. Uma consulta oficial mais recente substitui a referência anterior
daquele anúncio. Resumos do anunciante são guardados por anunciante e período.

Na Gestão de Ads, **Relatórios salvos** abre os comparativos compartilhados sem nova
consulta. A janela de 90 dias limita a atualização pela API, não a leitura do que já
foi arquivado. Os filtros de visualização de um funcionário não substituem os dos colegas.
A visão principal do anunciante continua apresentando os últimos 30 dias encerrados.

As conciliações são identificadas por conta, anúncio e período. Alterações em períodos
diferentes são combinadas. Quando dois funcionários mudam a mesma conciliação de forma
divergente, a revisão mostra receita, despesas, escopo e fonte para escolher a versão.
Uma conciliação em edição não recebe alterações externas enquanto o formulário estiver aberto.
Mudanças na evidência de Ads continuam exigindo conferência antes de aceitar lucro apurado.

Dados existentes no navegador são incorporados ao sincronizar, apenas para a conta
autorizada. Dados de outra conta permanecem locais. O backup **v18** inclui os arquivos
de relatórios e resumos e continua aceitando versões anteriores. Restaurar um backup
antigo não remove relatórios nem conciliações que já estão na base compartilhada.

A API usa a versão 3 do protocolo de gravação e a conferência da conta da aba.
Com várias empresas configuradas, abas antigas recebem um aviso para atualizar a
página, sem permissão para substituir a base de outra empresa. A versão 2 permanece
compatível apenas na configuração antiga de uma única conta.
Não há nova tabela, credencial, permissão do Mercado Livre ou serviço pago.

## Plano gratuito e limites

Mantenha Workers e D1 no plano **Free**. O D1 oferece 5 milhões de linhas lidas e
100 mil escritas por dia, com 500 MB por banco no Free e 5 GB totais na conta.
No Free, consultas são recusadas ao atingir os limites, em vez de gerar cobrança
por excedente. Esta configuração não contrata nem promove a conta a um plano pago.
Fontes: [preços D1](https://developers.cloudflare.com/d1/platform/pricing/) e
[limites D1](https://developers.cloudflare.com/d1/platform/limits/), consultados
em 24/11/2026.

O painel limita cada envio do catálogo a **8 MB**, até 5.000 produtos e 5.000 kits.
Os limites de tamanho e quantidade são independentes. As imagens não são enviadas
como arquivos ao banco; os vínculos mantêm os dados já presentes no cadastro.
Consultas usam os índices do vendedor e da revisão. O consumo real depende da
quantidade de alterações e dos dados. Confira as métricas do D1 na conta.

O [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) do D1
é uma opção de recuperação administrada pelo Cloudflare, separada do backup JSON.
O painel não apresenta uma tela de restauração dessas revisões nesta etapa.

## Verificação

`tests/catalog-server.test.cjs` verifica a autenticação, isolamento da conta,
origem, transações, conflito de versão, integridade Unicode e validação usando SQLite.
Também verifica duas empresas autorizadas com revisões independentes e bloqueio
de abas antigas ou de cabeçalhos incompatíveis com a sessão.
`tests/account-storage.test.cjs` verifica migração sem perda, cópias locais separadas,
troca de conta, rascunhos, armazenamento indisponível e proteção contra mistura de Ads.
`tests/catalog-sync.test.cjs` verifica dois funcionários, revisão de conflitos,
migração inicial, falha de rede e alterações durante gravações.
`tests/catalog-resilience.test.cjs` usa HTTP local e o mesmo handler de produção,
com SQLite em memória e uma conta fictícia. Verifica recuperação após queda de rede
e recarregamento, resposta perdida depois da gravação, erro 503, conflitos em
produtos/kits/conciliações, escolhas explícitas e proteção de formulários abertos.

Para repetir a conferência pela interface:

```sh
node tests/support/catalog-lab.cjs
```

Abra `http://127.0.0.1:43181/` e `http://127.0.0.1:43182/`. As duas origens têm
armazenamentos locais separados e compartilham somente o banco fictício em memória.
A página `/__lab` de cada origem permite interromper e restaurar a conexão desse
cliente. Não usa credenciais reais, não consulta o ML e não acessa o D1 remoto.
O laboratório fica fora de `dist` e não é publicado. Encerre com Ctrl+C.

Em 24/11/2026, a conferência manual confirmou conflitos nos três tipos de cadastro
e recuperação sem importação: custo do produto de R$ 19,00, adicional do kit de
R$ 3,00 e custo conciliado de R$ 30,00 chegaram à segunda sessão sem duplicatas.
Na primeira conciliação, receita R$ 80,00 menos despesas de R$ 48,00 e Ads de
R$ 10,00 resultou em R$ 22,00; o gasto de Ads foi descontado uma única vez.
O aviso de sincronização/revisão fica disponível nas três telas. Uma falha
temporária na abertura permite nova tentativa sem limpar a cópia local; a
retomada verifica a sessão existente e continua respeitando sua expiração.

Testes locais não comprovam que a sessão real do navegador tenha sido conectada,
nem substituem a primeira associação e a conferência dos produtos no endereço publicado.
Referência técnica: [API de banco e transações D1](https://developers.cloudflare.com/d1/worker-api/d1-database/).
