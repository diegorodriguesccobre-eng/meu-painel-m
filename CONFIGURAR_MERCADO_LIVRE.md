# Ativar a conexão com o Mercado Livre

O fluxo está implementado para o painel em **https://SEU_SITE.netlify.app/**.
Ele precisa das credenciais de um aplicativo do Mercado Livre antes de poder consultar sua conta.
Não envie essas credenciais pelo chat nem coloque valores reais no GitHub.

## 1. Criar ou configurar seu aplicativo

No [portal Developers do Mercado Livre](https://developers.mercadolivre.com.br/),
crie um aplicativo para a conta da sua empresa ou use um aplicativo existente.
Use permissões de **leitura** para dados da conta, anúncios e catálogo. A integração
não publica anúncios e não envia alterações de preço, estoque ou taxas ao marketplace.
Habilite PKCE na configuração de segurança do aplicativo, se a opção estiver disponível.

Cadastre este endereço exato como **Redirect URI de OAuth**:

```text
https://SEU_SITE.netlify.app/api/ml/callback
```

Esse é o redirecionamento de autorização, não um webhook de notificações.
Anote o App ID e a Secret Key gerados pelo Mercado Livre.

Referências oficiais: [configurar uma aplicação](https://developers.mercadolivre.com.br/pt_br/lojas-oficiais/configuracao-ou-requisitos-previos)
e [OAuth, permissões e PKCE](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/desenvolvimento-in-house).

## 2. Configurar variáveis no Netlify

Nas configurações do projeto `precificacaoprodutos`, adicione as variáveis de ambiente
abaixo, disponíveis às **Functions**, no contexto de produção:

| Variável | Valor |
| --- | --- |
| `ML_CLIENT_ID` | O App ID do aplicativo do Mercado Livre. |
| `ML_CLIENT_SECRET` | A Secret Key do aplicativo. |
| `ML_SESSION_SECRET` | Uma chave aleatória de 32 bytes, representada por 64 caracteres hexadecimais. |
| `ML_REDIRECT_URI` | `https://SEU_SITE.netlify.app/api/ml/callback` |

Para gerar `ML_SESSION_SECRET` no seu computador com Node instalado:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie a chave gerada diretamente para a variável no Netlify. Não use o texto de exemplo
do `.env.example` como chave real. O `.env.example` contém somente nomes e placeholders.

Depois de salvar as variáveis, faça uma nova publicação do projeto no Netlify.
O `netlify.toml` já define o diretório das Functions. A função é publicada a partir de
`netlify/functions/mercadolivre.mjs`; não precisa contratar ou manter um servidor próprio.

Referências: [variáveis de ambiente das Functions](https://docs.netlify.com/build/functions/environment-variables/)
e [Functions do Netlify](https://docs.netlify.com/build/functions/overview/).

## 3. Conectar a conta e vincular um anúncio

1. Abra o painel no endereço publicado e clique em **Conectar Mercado Livre**.
2. Confira a conta e autorize a leitura no próprio Mercado Livre.
3. No painel, clique em **Novo produto**.
4. Use **Escolher do meu catálogo** ou informe o ID `MLB...`/link do seu anúncio em
   **Buscar e vincular**. No catálogo, **Carregar mais anúncios** consulta o próximo lote.
   A busca do diálogo filtra os anúncios já carregados; o ID/link consulta diretamente.
5. Confira nome, categoria e peso. Se o peso não estiver disponível na API, preencha-o.
   Anúncios com variações exigem conferir o SKU e o peso antes de salvar.
6. Informe o **custo de compra**, sua margem, frete e outros custos. O preço anunciado
   importado é uma referência e **não é usado como custo de compra**.
7. Abra **Taxas deste produto** para informar as comissões, taxas fixas, impostos e
   opções da Shopee desejadas. Os campos começam com as taxas padrão ou, ao editar,
   com as taxas já preservadas no produto.
8. Salve o produto. O vínculo, o preço de referência e as taxas ficam no navegador
   e no backup completo. A tabela também mostra o ID vinculado e o preço de referência.

O vínculo só é gravado ao salvar. Consultar outro anúncio preenche o formulário, mas não
modifica o cadastro salvo antes da confirmação. Remover o vínculo mantém os campos do
produto; salve para confirmar a remoção. A consulta não altera anúncios no Mercado Livre.

## Sessão e dados

- A conta do vendedor é autorizada por OAuth com `state` e PKCE.
- A Secret Key fica nas variáveis das Functions. O access token fica em um cookie
  criptografado, `Secure` e `HttpOnly`; o JavaScript do painel não tem acesso a ele.
- O token não é gravado em localStorage, no catálogo, nos backups ou nos logs do código.
- A sessão dura no máximo seis horas. Quando expirar, use **Conectar Mercado Livre**
  novamente. Esta versão não guarda refresh token nem renova a sessão em segundo plano.
- **Desconectar** remove a sessão deste navegador e mantém os produtos locais. Para
  revogar a autorização do aplicativo, use também as configurações do Mercado Livre.
- Cada navegador autoriza sua própria conta. A função confere se o anúncio pertence
  ao vendedor conectado antes de permitir o vínculo.
- O cadastro manual, os cálculos, os kits, o CSV e o backup continuam funcionando
  sem conexão. A consulta à conta requer internet e a versão publicada no Netlify.

## Conferir a instalação

Abra `https://SEU_SITE.netlify.app/api/ml/status`.
Sem as quatro variáveis válidas, ele retorna `configured: false`.
Com a configuração válida, retorna `configured: true`; `connected` só fica `true`
após autorizar a conta neste navegador. A resposta não mostra credenciais.

Erros de permissão pedem revisar os scopes e permissões no aplicativo do Mercado Livre.
Se a API limitar consultas, aguarde antes de tentar novamente. Links de páginas de
catálogo sem o anúncio do vendedor podem não identificar um item: use o ID do seu
anúncio ou um link que inclua `item_id=MLB...`.

## Verificação realizada

`npm run build` executa os testes do painel e os testes da integração com respostas
simuladas da API: OAuth, PKCE, origem das requisições, cookies, sessão, propriedade
dos anúncios, importação, erros, taxas individuais, backup e remoção do vínculo.
A consulta real ao seu catálogo depende de configurar as credenciais e autorizar
a conta. Ela não é considerada validada apenas pelos testes simulados.

## Tarifas oficiais

A cotação automática também usa o acesso de leitura já autorizado. Não exige novas
variáveis, permissões de escrita ou alteração nos anúncios. As chamadas usam o anúncio
do próprio vendedor e o recurso `/sites/MLB/listing_prices`. A API calcula comissão e
parcela fixa por preço, categoria, modalidade e logística. O frete do vendedor é consultado automaticamente em `/users/{id}/shipping_options/free`, com `item_id`, preço, modalidade, logística e `free_shipping`. O valor é estimado; não é o frete cobrado do comprador. Imposto continua informado no painel. Cada produto guarda a cotação usada ao salvar.
