-- Task priority: low / normal / high (colour-coded in the Tasks page). Additive: existing tasks become "normal".
alter table public.tasks
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high'));

-- Tasks keep a column-level UPDATE grant (see 0011); the priority can be changed from the list like title/notes/due date/assignee.
grant update (priority) on public.tasks to authenticated;
