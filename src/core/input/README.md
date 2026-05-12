# מערכת Input

מגדירה state מרכזי לכלי פעיל, modifiers, keyboard shortcuts ומחזור חיים של pointer/drag.

משתמשים בה: CanvasStage, tool switching, keyboard shortcuts וכלי עריכה עתידיים.

אסור לעשות: שכל component ימציא lifecycle משלו ל־mousedown/move/up, או לקודד shortcut logic בצורה מקומית.

הרחבה עתידית: command routing לפי כלי פעיל, double click actions, enter/escape policies ו־touch gestures.
