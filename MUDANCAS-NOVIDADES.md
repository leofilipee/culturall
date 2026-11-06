# Cultur'All — Registo das mudanças aplicadas (3 nov 2026)

Origem: `CulturAll-melhorado.zip` aplicado sobre o projeto online (Vercel + TiDB).
**Backend e base de dados não foram alterados** (`api/`, `bdd/`, `vercel.json`, `package.json` iguais). Tudo é front-end.

## Ficheiros novos
| Ficheiro | O que faz |
|---|---|
| `stats.html` | Nova página **Observatório Cultural**: gráficos (Chart.js) de eventos por distrito, categoria, mês e eventos mais vistos. |
| `enhancements.js` | Interatividade da página inicial e do Observatório: carrossel de destaques, chips de filtro rápido (categoria/data), vista de mapa (Leaflet + OpenStreetMap), sugestões de pesquisa, animações de entrada dos cartões e animação do coração. |
| `demo-events.js` | Eventos de teste **temporários**; só são usados se `/api/events` devolver 0 eventos. |

## Ficheiros alterados
**index.html**
- Leaflet (CSS/JS) via unpkg; scripts `demo-events.js` e `enhancements.js`.
- Pesquisa com caixa de sugestões; link "Observatório" no cabeçalho.
- Novas secções: carrossel de destaques, filtros rápidos (chips), alternador Lista/Mapa com mapa e legenda, cartões "skeleton" de carregamento.
- Novo item "Dados" na navegação inferior.

**event.html / favorites.html** — carregam `demo-events.js` e `enhancements.js`; favorites ganha "Dados" na navegação.

**script.js** (apenas acrescentos/ajustes)
- Cartões redesenhados: selo de data, etiqueta de tempo (Hoje / Amanhã / Daqui a N dias / A decorrer / Terminado / Periódico), categoria em pill, visualizações com ícone.
- Eventos passados na home ("Todos") aparecem no fim, numa secção "Já aconteceram"; contador passa a "próximos eventos".
- Estado vazio novo, com botão "Limpar filtros" / "Explorar eventos".
- Detalhe do evento: botão **Calendário** (descarrega `.ics`) e botão **Partilhar**; partilha passa a usar o link do próprio evento (antes usava o URL da página atual).
- Toast de confirmação (`showToast`).
- Badge com contagem de favoritos no botão de favoritos.
- **Favoritos para visitantes sem sessão**: guardados no `localStorage` (antes redirecionava para o login; a página de favoritos também deixa de exigir login).
- Ponte `window.CulturAll` para o `enhancements.js`; suporte à página `stats`; fallback para eventos demo.

**styles.css** — só acrescentos (sem remoções): estilos de tudo o acima (destaques, chips, mapa, skeletons, cartões, Observatório, toast, animações).

## Notas / a rever
1. `demo-events.js` é temporário: para o remover, apagar o ficheiro e a linha `<script defer src="demo-events.js">` em `index.html`, `event.html`, `favorites.html` e `stats.html`.
2. Favoritos de visitantes ficam só no browser; não são enviados à base de dados.
3. Convertido para CRLF para coincidir com os ficheiros locais (sem ruído no `git diff`).

---

# Fase 2 — Mapa, perfis, apagar, sessão, calendário e galeria (3 nov 2026)

**Esta fase altera também o backend** (`api/[...route].js`). **Não é preciso migrar a base de dados**: a tabela `imagem` já suportava várias imagens por evento.

## Mapa
- Zoom com a roda do rato quando o cursor está sobre o mapa (`scrollWheelZoom`).
- Os eventos passados deixam de aparecer no mapa; a legenda já não tem "Já aconteceu". (`enhancements.js`)

## Favoritos só para utilizadores normais
- Administrador e Organizador **não veem** o botão de favoritos (cabeçalho, cartões, destaques, detalhe do evento, navegação inferior) e a página `favorites.html` redireciona-os para a página inicial. (`script.js`, `enhancements.js`)
- Visitantes sem sessão continuam a poder favoritar (localStorage).
- Reforço no servidor: a API recusa favoritos de contas que não sejam utilizador normal.

## Apagar da base de dados (painel de administrador)
- Novo botão de **apagar** (ícone de caixote) ao lado de inativar/ver, para utilizadores, organizadores e eventos, com janela de confirmação.
- Novas rotas `DELETE /api/admin/users` e `DELETE /api/admin/organizers` (corpo `{ email }`). Apagar um organizador apaga também os eventos dele e a conta. Não se podem apagar contas de administrador nem a própria conta.

## Observatório → Dashboard
- Todo o conteúdo do Observatório passou para a secção **Dashboard** do perfil do Administrador; o link foi removido da barra de navegação (e "Dados" da navegação inferior).
- `stats.html` fica como simples redirecionamento para `profile.html` (pode ser apagado do projeto; nada o referencia).
- `profile.html` agora carrega Chart.js, `demo-events.js` e `enhancements.js`.

## Página do Organizador
- Alternador de secção **Dashboard | Gestão** (por defeito abre em Gestão). O Dashboard é igual ao do administrador.
- Sem eventos: em vez da lista vazia, aparece "Não há eventos publicados." com botão **Adicionar Evento**.

## Sessão mantida entre páginas
- A sessão é guardada em cache local só para **mostrar** o cabeçalho de imediato; a verdade continua a ser o cookie. A cache só é limpa se a API responder 401/403 (testado com `/api/me` atrasado 1,5 s: o nome aparece logo).

## Calendário
- O botão **Calendário** abre diretamente o Google Calendar com o evento preenchido (inclui repetição semanal quando o evento é periódico), em vez de descarregar um `.ics`.

## Eventos com várias imagens
- Na criação/edição: até 10 imagens, escolha da **principal** (será a miniatura), compressão no browser para respeitar o limite de ~4,5 MB da Vercel.
- Na edição, as imagens existentes só são substituídas se forem enviadas novas.
- Página do evento: o banner ultrawide foi substituído por um **carrossel 16:9** lento e contínuo, que **pára com o rato por cima**; ao clicar abre a imagem ampliada com fundo escurecido e borda discreta (setas, Esc para fechar).
- Nova rota `GET /api/event-images?eventId=` (evita pesar a lista de eventos).

## Ficheiros tocados
`script.js`, `styles.css`, `enhancements.js`, `index.html`, `favorites.html`, `profile.html`, `stats.html`, `api/[...route].js`.

---

# Fase 3 — Visibilidade do evento: Publicar / Agendar / Ocultar (3 nov 2026)

## O que muda para o organizador
- No formulário de criar/editar evento há uma nova secção **Visibilidade**, como no YouTube:
  - **Publicar** — o evento fica visível a todos assim que guardas (estado `publicado`).
  - **Agendar** — escolhes data e hora; o evento fica oculto e é publicado automaticamente nessa altura.
  - **Ocultar** — o evento fica guardado só para o organizador (estado `oculto`) e pode ser publicado mais tarde, editando-o.
- O texto do botão muda conforme a opção ("Publicar evento", "Agendar evento", "Guardar como oculto").
- Na tabela de gestão, o estado mostra **Publicado**, **Agendado** (azul), **Oculto** ou **Pendente**.
- Ao editar, a opção atual do evento vem preenchida.

## Backend (`api/[...route].js`)
- `POST /api/events` e `PATCH /api/events` (`action: update`) aceitam `visibility` (`publish` | `schedule` | `hide`) e `publishAt` (ISO, em UTC). Sem `visibility` mantém-se o comportamento antigo (`pendente`).
- **Nova coluna `evpublicaem DATETIME NULL` na tabela `evento`**, criada automaticamente na primeira utilização (`ALTER TABLE`). Se o utilizador da BD não tiver permissão para alterar tabelas, o agendamento fica desativado (Publicar/Ocultar continuam a funcionar) e aparece um aviso nos logs da Vercel. Alternativa manual: `ALTER TABLE evento ADD COLUMN evpublicaem DATETIME NULL;`
- Um evento agendado é `oculto` com `evpublicaem` preenchido. Sempre que a lista de eventos (ou a galeria de um evento) é pedida, os agendados cuja hora já passou são publicados (`UPDATE ... evpublicaem <= UTC_TIMESTAMP()`). Não é preciso cron.
- Ações do administrador (mostrar/ocultar/aprovar) e as ações de gestão do organizador limpam o agendamento.
- **Decisão a rever:** "Publicar" já não passa por aprovação do administrador (antes os eventos novos ficavam `pendente`). O admin continua a poder ocultar, inativar ou apagar qualquer evento.

## Correção
- O botão de **editar** evento do organizador estava partido (`openOrganizerEdit is not defined` — a função estava fora do alcance do clique). Corrigido.

## Ficheiros tocados
`script.js`, `styles.css`, `api/[...route].js`.

---

# Fase 4 — Base para analisar a bilheteira integrada (4 nov 2026)

## Para utilizadores
- Eventos gratuitos deixam de ter o botão "Ver Bilhetes" (não têm bilheteira). Nos pagos, o botão regista o clique e abre a bilheteira.
- O botão "Calendário" já não mostra falsamente que o browser bloqueou a janela.

## Para organizadores
- Dashboard com visualizações, cliques, CTR, favoritos, partilhas e calendário por dia/semana/mês/trimestre/semestre/ano, comparação com o período anterior, filtro por evento, exportação CSV e comparação com a plataforma (só com amostra mínima).
- Perfil da entidade (tipo, concelho, bilheteira própria, interesse numa bilheteira integrada).
- Formulário: morada, cidade e distrito separados; a descrição já não se perde ao editar; categoria e local passam a ser atualizados; eventos gratuitos não guardam link.

## Para administradores
- Dashboard global com filtros (organizador, evento, categoria, distrito, dados reais/simulados), por organizador, e resumo do perfil dos organizadores.

## Backend / BD
- Nova tabela `eventointeracao` (migração `bdd/Migration_2026_11_04_analytics.sql`, também aplicada automaticamente), novas colunas (publicação, coordenadas, favdata, perfil do organizador), links de bilhetes até 2048 caracteres.
- Validação no servidor (títulos, datas, preço, URLs http/https, categorias e distritos), escape de HTML no front-end e capas servidas por `/api/event-cover`.

## Fase 5 — Edição, aprovação e notificações

- **Aprovação obrigatória:** um evento criado (ou agendado) por um organizador fica `pendente` e só entra na plataforma depois de um administrador o aprovar. O organizador vê o aviso "a aprovação pode demorar de 1 a 3 dias". Eventos anteriores a 2026-11-07 são tratados como já aprovados (migração, secção 5 de `bdd/Migration_2026_11_04_analytics.sql`; corre-se sozinha no arranque da API).
- **Editar evento:** botão de lápis nos cartões dos próprios eventos e botão "Editar evento" na página do evento (abre `profile.html?edit=ID` já com o formulário preenchido).
- **Visão Organizador / Utilizador:** na página de um evento do próprio organizador há um interruptor. Na visão de organizador aparece o estado do evento, avisos e estatísticas; na de utilizador vê-se a página como o público. As visitas do organizador não contam nas estatísticas. O organizador também abre os seus eventos pendentes/ocultos.
- **"Só os meus eventos":** interruptor nos filtros da página inicial (só para organizadores; a preferência fica guardada no browser).
- **Descrição:** parágrafos e quebras de linha são respeitados; primeiro parágrafo destacado.
- **Sino do administrador:** na barra de topo, com contador de eventos por aprovar e contas de organizador por validar (`GET /api/admin/notifications`); atualiza a cada minuto e após ações de administração.
- **Galeria:** sombra suave por trás das imagens em vez do contorno escuro.

### Fase 5b — Alterações sujeitas a aprovação e revisão pelo administrador

- **Editar um evento já aprovado gera um "pedido de alteração":** a versão pública mantém-se até um administrador aprovar (tabela nova `eventoalteracao`, criada sozinha pela API e na secção 6 da migração). Publicar/agendar/ocultar continua imediato; só o conteúdo (título, descrição, datas, preço, local, imagens…) espera aprovação. Editar de novo substitui o pedido anterior.
- **Cancelar:** "Cancelar pedido de aprovação" (evento novo pendente → fica oculto) e "Cancelar pedido de alteração" (descarta as mudanças), na tabela do organizador e na página do evento. Se o administrador recusar uma alteração, o organizador vê o motivo e pode dispensar o aviso.
- **Revisão pelo administrador na página do evento:** `event.html?id=ID` abre para o administrador mesmo com o evento pendente. Mostra o evento tal como ficará, com botões Aprovar/Recusar (recusa pede motivo), e nos pedidos de alteração a lista do que muda e um interruptor "Versão atual / Versão proposta". A lista de moderação e o sino têm ligações diretas para essas páginas. Visitas e cliques de administradores/donos não contam nas estatísticas.
- `GET /api/event-review?id=` (admin ou dono) e ações `approve_change`, `reject_change` (admin), `cancel_change`, `cancel_request` (organizador).
