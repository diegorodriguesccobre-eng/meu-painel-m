# Publicar no Cloudflare Workers Free

O mesmo repositório publica o painel e a integração de consulta do Mercado Livre.
Use exclusivamente Workers Free e o endereço gratuito `workers.dev`.
Não são necessários banco de dados, domínio pago, R2, Durable Objects ou plano pago.
Os produtos e kits continuam salvos no navegador; não há sincronização entre aparelhos.

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
Cada funcionário pode restaurar uma cópia no seu próprio navegador.

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

Não publique arquivos `.env`, `.dev.vars`, tokens ou backups no repositório.
Não altere o aplicativo antigo `conduz-cobre-ml-api`; ele é independente deste painel.
