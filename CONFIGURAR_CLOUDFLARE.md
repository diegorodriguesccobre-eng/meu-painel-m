# Publicar no Cloudflare Workers Free

Endereço publicado: https://precificacaoconduz.conduz-cobre.workers.dev/

O mesmo repositório publica o painel e a integração de consulta do Mercado Livre.
Use exclusivamente Workers Free e o endereço gratuito `workers.dev`.
Não são necessários domínio pago, R2, Durable Objects ou plano pago.
O uso manual mantém os produtos e kits no navegador. Para compartilhar o catálogo
entre funcionários, o projeto também oferece Cloudflare D1 Free com autenticação
pela conexão Mercado Livre. Veja [CONFIGURAR_CATALOGO.md](CONFIGURAR_CATALOGO.md).

## Publicação pelo GitHub

1. No Cloudflare, abra Workers & Pages e crie uma aplicação conectada ao repositório
   `diegorodriguesccobre-eng/meu-painel-m`.
2. Nome da aplicação: `precificacaoconduz`; branch: `main`; diretório: raiz.
3. Build: `npm run build`. Deploy: `npx wrangler deploy`.
4. Confira que o plano é **Free**. Não ative serviços pagos ou upgrades.
5. O arquivo `wrangler.jsonc` mantém os arquivos estáticos fora da execução da API.

## Configuração privada do Mercado Livre

No Worker, cadastre como secrets de produção:

- `ML_CLIENT_ID`: App ID do aplicativo já criado.
- `ML_CLIENT_SECRET`: chave secreta atual; nunca coloque no GitHub ou no chat.
- `ML_SESSION_SECRET`: 64 caracteres hexadecimais aleatórios para criptografar a sessão.
- `ML_REDIRECT_URI`: endereço HTTPS do novo painel, terminado em `/api/ml/callback`.

Cadastre o mesmo endereço de retorno nas configurações do aplicativo do Mercado Livre.
Não amplie as permissões; a integração usa somente consulta de anúncios e tarifas.
Depois, no painel novo, clique em Conectar Mercado Livre e conclua a autorização.
O endereço de retorno depende da implantação: exemplos não substituem a URL real.

## Levar os produtos para o novo endereço

No painel antigo, clique em Baixar backup. No painel novo, use Restaurar backup.
Confirme a contagem de produtos e kits antes de substituir os dados do novo endereço.
O arquivo é lido no navegador; não é necessário enviar o catálogo a um servidor.
Sem catálogo compartilhado, cada funcionário pode restaurar uma cópia no seu navegador.
Com o D1 ativado, associe o catálogo principal uma vez e conecte a mesma conta
autorizada nos demais aparelhos; a transferência por arquivo passa a ser opcional.

## Testes e limites gratuitos

`npm run check:cloudflare` executa os testes e empacota o Worker sem publicar.
`npm run dev:cloudflare` abre o runtime local; sem secrets, o cadastro manual funciona
e a conexão informa que ainda não está configurada.
`npm run deploy:cloudflare` executa os testes e publica somente após autenticar na conta.

O adaptador interrompe uma operação antes de ultrapassar 45 chamadas externas,
abaixo do limite de 50 subrequisições do plano Free. As cotações anteriores ficam
preservadas se uma consulta não puder concluir. É necessário validar o tempo de CPU
e os cálculos com a conta real depois da implantação; testes locais não comprovam
o tempo de CPU cobrado no Cloudflare.

## Controles compartilhados de consulta e retenção

Antes de publicar com `ML_ACCOUNT_CONTROLS="true"`, aplique a migração aditiva
`0002_ml_account_controls.sql` ao D1 já existente. Ela cria três tabelas de
metadados, sem modificar os cadastros. Use `npx wrangler d1 migrations apply
conduz-cobre-catalogo --remote` e confira a lista de migrações pendentes antes da
confirmação. Não crie outro banco nem altere o plano Free.

Com os controles ativos, são reservadas até 40 chamadas externas por operação,
deixando espaço para os controles D1 na franquia por execução. A aplicação mantém
cotas internas por vendedor de 300 chamadas/minuto e 8.000/dia (dia UTC), com
devolução das reservas não usadas e pausa compartilhada após 429. Essas cotas não
substituem os limites oficiais de cada recurso do Mercado Livre.

A autorização é verificada via `/users/me` com cache de até cinco minutos por
hash do token; tokens não ficam no D1. Renovação do catálogo usa reserva de até
20 minutos, e a próxima janela de cinco horas só é confirmada após sincronizar.
Não há Cron, KV, R2, Durable Objects nem recurso pago adicional.

O encerramento da integração está em `/api/catalog/lifecycle`, exige sessão
autorizada, origem, conta, geração dos dados, confirmação textual e revisão atual.
Uma transação preserva os dados internos, remove os importados, elimina revisões
anteriores e invalida sessões antigas. O cabeçalho `X-Conduz-Data-Epoch` impede que
clientes antigos reponham os dados removidos; a restauração é sanitizada também
no servidor. Não execute esse encerramento em produção para testar: utilize
`node tests/support/ml-controls-lab.cjs`, que usa D1 em memória e API fictícia.

Revogação externa bloqueia o acesso quando confirmada, mas não apaga
automaticamente o catálogo: uma resposta 401 isolada não comprova que o titular
pediu exclusão. Solicitações sem acesso ao ML exigem atendimento pelo responsável,
com verificação da empresa e distinção entre registros próprios e dados importados.
Backups técnicos do provedor e arquivos exportados têm tratamento separado.

Não publique arquivos `.env`, `.dev.vars`, tokens ou backups no repositório.
Não altere o aplicativo antigo `conduz-cobre-ml-api`; ele é independente deste painel.

## Validação da migração

Em 12/11/2026, a publicação pelo GitHub foi validada no plano Workers Free ($0).
Foram conferidos login OAuth, leitura do catálogo e consultas oficiais de tarifas
e frete para um produto e um kit. Os rascunhos de teste não foram salvos no catálogo.
O backup foi restaurado no navegador usado durante a migração. Outros computadores
precisam restaurar o mesmo backup para ter uma cópia do catálogo.
