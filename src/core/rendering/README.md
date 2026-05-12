# מערכת Rendering

מגדירה מעבר נקי מ־Document Data ל־Render Model ואז לקומפוננטות Konva. Render Model הוא projection בלבד ולא מקור אמת.

משתמשים בה: CanvasStage, export preparation וכל renderer עתידי.

אסור לעשות: לשמור document data בתוך React components או Konva nodes, להשתמש ב־original asset למסך, או לערבב viewport transform עם מידות המסמך.

הרחבה עתידית: להוסיף render passes, virtualization לעמודים מרובים, ו־high quality export renderer שמשתמש ב־originals.
