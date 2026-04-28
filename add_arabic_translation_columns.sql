alter table if exists public.categories
add column if not exists name_ar text;

alter table if exists public.menu_items
add column if not exists name_ar text,
add column if not exists description_ar text;
