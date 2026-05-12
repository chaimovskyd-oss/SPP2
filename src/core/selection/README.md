# Selection

Selection is a single shared manager. It references canonical layer ids and does
not duplicate layer data.
# מערכת Selection

מרכזת בחירה בודדת, בחירה מרובה, marquee, בחירה מפאנל שכבות, התחשבות בשכבות נעולות/נסתרות, z-index ו־rotated bounds.

משתמשים בה: `selectionStore`, `CanvasStage`, Layer Panel וכלי טרנספורם עתידיים.

אסור לעשות: להחזיק selected state בתוך שכבות, לשמור בחירה בקומפוננטה מקומית, או לבצע hit testing ידני שלא דרך מערכת bounds/selection.

הרחבה עתידית: group selection, nested selection, isolation mode ו־selection scopes.
