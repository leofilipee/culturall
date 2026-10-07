# CulturAll

Aplicação web de eventos culturais com frontend em HTML/CSS/JavaScript e API serverless em Node.js com MySQL.

## Execução local

1. Importa [bdd/ScriptTabelas.sql](bdd/ScriptTabelas.sql) na tua instância MySQL ou MariaDB.
2. Importa [bdd/SeedData.sql](bdd/SeedData.sql) para carregar utilizadores, organizadores, eventos e favoritos de teste.
3. Define `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` e `SESSION_SECRET` (ou os equivalentes `DB_*`) no ambiente local.
4. Instala as dependências com `npm install` e arranca o servidor local com `npx vercel dev` (ou usa um servidor PHP apenas para visualizar o frontend).
5. Abre o endereço indicado pelo Vercel CLI, normalmente `http://localhost:3000/login.html`. Não uses o Live Preview do VS Code para testar login ou registo, porque ele não executa as funções serverless.

## Deployment na Vercel

O projeto está preparado para ser importado diretamente na Vercel:

1. Cria uma base de dados MySQL externa compatível com a Vercel.
2. Importa [bdd/ScriptTabelas.sql](bdd/ScriptTabelas.sql) e [bdd/SeedData.sql](bdd/SeedData.sql) nessa base de dados.
3. Importa o repositório na Vercel e configura `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL=true` e `SESSION_SECRET`.
4. Faz o deploy. Os ficheiros HTML, CSS e JavaScript são servidos como conteúdo estático e [api/[...route].js](api/[...route].js) trata os endpoints serverless.

`SESSION_SECRET` deve ser uma string aleatória longa. A Vercel não fornece uma base de dados nem armazenamento de sessões PHP, por isso a API usa cookies assinados e uma ligação MySQL externa.

### Deploy

A partir da raiz do projeto, usa a Vercel CLI:

```powershell
npx vercel
```

Para produção:

```powershell
npx vercel --prod
```

A Vercel lê o [`.vercelignore`](.vercelignore), exclui `node_modules` e `.git`, instala as dependências no ambiente Linux e cria o pacote de deploy no servidor.

## Observação sobre credenciais

As credenciais devem ser geridas através da base de dados importada (`bdd/SeedData.sql`). Não inclua credenciais fictícias no código-fonte.

## Registo de Organizadores

Ao criar conta, é possível escolher entre conta normal e conta de organizador. As contas normais entram logo na plataforma. As contas de organizador ficam com estado pendente até serem aprovadas no painel de administração.

## API

Os endpoints principais são `/api/login`, `/api/register`, `/api/me`, `/api/events`, `/api/favorites`, `/api/event-views` e os endpoints administrativos em `/api/admin/*`.
