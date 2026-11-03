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
