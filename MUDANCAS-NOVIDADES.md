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
