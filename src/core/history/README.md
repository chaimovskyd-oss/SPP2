# History

History is command-based. Persistent state should change through actions that
can be undone and redone.
# מערכת היסטוריה

Undo/Redo מבוסס actions ולא snapshots מלאים. כל פעולה יודעת `apply` ו־`undo`, ותומכת ב־batch actions, transactions, דחיסת drag עתידית ומגבלת זיכרון.

משתמשים בה: `documentStore` וכל פעולה שמשנה Document/Page/Layer/Asset.

אסור לעשות: לדחוף עותק מלא של Document למחסנית היסטוריה כברירת מחדל, לעקוף את ה־store, או לשנות Konva node בלי פעולה מתועדת.

הרחבה עתידית: להוסיף compression לפי `mergeKey`, grouping לעריכת טקסט, ו־history inspector לדיבוג.
