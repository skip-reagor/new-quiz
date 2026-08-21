# Quiz content editor

Edit these three CSV files in Excel, Numbers, Google Sheets, or a plain-text editor, then save them as CSV with the same file names.

- `drinks.csv` controls the result names, headings, taglines, and descriptions.
- `questions.csv` controls question order and prompts.
- `answers.csv` controls answer text and order.
- `scoring.csv` controls the point rules. Each row is one plain-language rule: the listed answer gives the listed drink the listed number of points.

Do not change IDs or column headings after the app is live; use them to connect the files.

Scoring tip: use 3 points for a strong match, 2 for a medium match, and 1 for a light match. Add or delete scoring rows to change which drinks an answer can lead to. A blank rule means that answer gives a drink zero points.
