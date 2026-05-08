create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnels (
  id text primary key,
  slug text not null unique,
  title text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnel_steps (
  id text primary key,
  flow_id text not null references funnels(id) on delete cascade,
  source_id text,
  step_index integer not null,
  type text not null check (type in ('info', 'question', 'loader')),
  question_key text,
  question_type text check (question_type in ('single_select', 'multi_select', 'input')),
  title text not null,
  description text,
  image_url text,
  question_image_url text,
  required boolean not null default false,
  input_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, step_index),
  unique (flow_id, question_key)
);

create table if not exists answer_options (
  id text primary key,
  step_id text not null references funnel_steps(id) on delete cascade,
  value text not null,
  label text not null,
  description text,
  icon_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (step_id, value)
);

create table if not exists assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  anonymous_id text not null unique,
  flow_id text not null default 'default' references funnels(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'result_ready', 'expired')),
  current_step_index integer not null default 0 check (current_step_index >= 0),
  subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'active', 'cancelled', 'refunded')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table funnel_steps add column if not exists image_url text;
alter table funnel_steps add column if not exists question_image_url text;
alter table answer_options add column if not exists icon_url text;

create table if not exists assessment_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references assessment_sessions(id) on delete cascade,
  question_key text not null,
  question_id text not null,
  step_index integer not null check (step_index >= 0),
  answer_type text not null check (answer_type in ('single_select', 'multi_select', 'input')),
  value jsonb not null,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_key)
);

create table if not exists assessment_results (
  session_id uuid primary key references assessment_sessions(id) on delete cascade,
  bmi numeric(5,2) not null check (bmi > 0),
  bmi_category text not null check (bmi_category in ('underweight', 'normal', 'overweight', 'obese')),
  bmr numeric(8,2) not null,
  tdee numeric(8,2) not null,
  recommended_calories integer not null check (recommended_calories > 0),
  target_date date not null,
  estimated_weeks integer not null check (estimated_weeks > 0),
  estimated_weeks_range text not null,
  summary jsonb not null default '{}'::jsonb,
  projection_curve jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references assessment_sessions(id) on delete cascade,
  provider text not null default 'mock' check (provider in ('mock', 'paypal')),
  provider_event_id text not null unique,
  provider_order_id text,
  provider_capture_id text,
  status text not null check (status in ('created', 'succeeded', 'failed', 'refunded')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (length(currency) = 3),
  raw_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists users_anonymous_id_idx on users (anonymous_id);
create index if not exists funnel_steps_flow_id_idx on funnel_steps (flow_id, step_index);
create index if not exists answer_options_step_id_idx on answer_options (step_id, sort_order);
create index if not exists assessment_sessions_user_id_idx on assessment_sessions (user_id, updated_at desc);
create index if not exists assessment_sessions_flow_id_idx on assessment_sessions (flow_id);
create index if not exists assessment_sessions_active_subscription_idx
  on assessment_sessions (updated_at desc)
  where subscription_status = 'active';
create index if not exists assessment_answers_session_id_idx on assessment_answers (session_id, step_index);
create index if not exists assessment_results_session_id_idx on assessment_results (session_id);
create index if not exists payments_session_id_idx on payments (session_id, created_at desc);

alter table users enable row level security;
alter table funnels enable row level security;
alter table funnel_steps enable row level security;
alter table answer_options enable row level security;
alter table assessment_sessions enable row level security;
alter table assessment_answers enable row level security;
alter table assessment_results enable row level security;
alter table payments enable row level security;
