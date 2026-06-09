create table if not exists public.leaderboard_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 16),
  score integer not null check (score > 0 and score < 10000000),
  mode text not null check (mode in ('classic', 'arcade', 'cursed')),
  created_at timestamptz not null default now()
);

alter table public.leaderboard_scores enable row level security;

drop policy if exists "Public leaderboard scores are readable" on public.leaderboard_scores;
create policy "Public leaderboard scores are readable"
on public.leaderboard_scores
for select
using (true);

drop policy if exists "Players can submit leaderboard scores" on public.leaderboard_scores;
create policy "Players can submit leaderboard scores"
on public.leaderboard_scores
for insert
with check (
  char_length(player_name) between 1 and 16
  and score > 0
  and score < 10000000
  and mode in ('classic', 'arcade', 'cursed')
);

create index if not exists leaderboard_scores_mode_score_idx
on public.leaderboard_scores (mode, score desc, created_at asc);
