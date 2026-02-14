
# PlanMaster - Central de Comando Pessoal

## Visão Geral
Aplicativo de planejamento integrado que une Calendário, Backlog de Tarefas, Gestão de Projetos e Finanças Pessoais, com sincronização em tempo real via Supabase.

---

## 1. Autenticação e Perfil de Usuário
- Login/cadastro com email e senha
- Tabela de perfis com nome, avatar e preferências (tema claro/escuro)
- Proteção de todas as rotas com autenticação

## 2. Layout Principal
- **Sidebar esquerda colapsável**: Backlog de tarefas agrupado por categorias com busca em tempo real e adição rápida (Enter)
- **Área central**: Calendário como visão principal
- **Navegação superior**: Tabs para alternar entre Calendário, Projetos e Finanças
- **Toggle de tema**: Dark mode (padrão #0f172a) e Light mode

## 3. Backlog Lateral (Sidebar)
- Lista de tarefas organizadas por categorias colapsáveis
- Cards com título, categoria, responsável, favorito (⭐) e anotações
- Filtro de busca global instantâneo
- Drag-and-drop das tarefas para o calendário
- Adição rápida de tarefas via campo de texto + Enter

## 4. Calendário
- **5 visões**: Hoje (agenda), 3 Dias (horizontal), Mensal (grid 7 colunas), Anual (12 meses), Personalizado (seletor de datas)
- Botão "Hoje" para retorno rápido
- Receber tarefas do backlog via drag-and-drop, agendando-as automaticamente
- Suporte a recorrência: diária, semanal, quinzenal, mensal, anual
- Eventos podem ser convertidos em tarefas de projeto

## 5. Gestão de Projetos (EAP)
- Lista de projetos com tabela segmentada: Nome, Categoria, Status, Responsável, Progresso
- Cards de tarefas estilo MS To-Do com título, categoria, responsável, anotações e favorito
- Tarefas concluídas movidas automaticamente para grupo "Concluídas" (oculto por padrão)
- Barra de progresso automática (concluídas/total)
- Reordenação de tarefas via drag-and-drop
- Tarefas de projetos aparecem automaticamente no Backlog

## 6. Finanças Inteligentes
- Lançamentos com título, valor, tipo (receita/despesa), categoria e projeto vinculado
- Parcelamento automático: ao definir N parcelas, gera N lançamentos com datas incrementais
- Filtros por período: diário, semanal, mensal
- Ordenação por coluna (clique nos cabeçalhos)
- Saldo dinâmico calculado conforme filtros aplicados
- Lançamentos vinculados a projetos afetam o orçamento do projeto

## 7. Gerenciador de Categorias Unificado
- Categorias podem ser marcadas como Receita, Despesa e/ou Projeto simultaneamente
- Utilizadas em todos os módulos (tarefas, finanças, projetos)

## 8. Banco de Dados (Supabase)
- Tabelas: profiles, categories, projects, tasks, calendar_events, financial_entries
- RLS em todas as tabelas (cada usuário vê apenas seus dados)
- Sincronização em tempo real entre dispositivos
- Auto-save automático

## 9. Responsividade
- Layout adaptável para mobile e desktop
- Sidebar colapsável no mobile
- Visões de calendário otimizadas para telas menores
