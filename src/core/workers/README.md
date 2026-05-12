# מערכת Workers

מגדירה wrapper לעבודות TypeScript ברקע ו־placeholder ל־Python bridge עתידי. כל worker עובד דרך Job Queue ומחזיר progress/error/cancel בצורה מסודרת.

משתמשים בה: preview generation, export, batch jobs וכלים כבדים עתידיים.

אסור לעשות: לקרוא ישירות ל־Python או להריץ עבודה כבדה בלי JobContext.

הרחבה עתידית: Web Workers אמיתיים, Electron IPC, Python process pool, shared cancellation tokens.
