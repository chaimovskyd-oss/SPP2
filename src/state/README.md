# State

Zustand stores hold app state around the canonical document model. Stores may
select, stage commands, or expose UI-friendly selectors, but persistent visual
truth remains inside `Document`, `Page`, and `VisualLayer` data.
