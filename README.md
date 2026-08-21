# Wedding Drink Quiz

A no-dependency Node web app for a wedding drink quiz. Guests take the quiz, receive a drink result, and can leave a note for the couple. The password-protected admin page shows all results and messages.

## Run locally

```bash
ADMIN_PASSWORD='choose-a-strong-password' npm start
```

Open `http://localhost:3000`. The admin dashboard is at `http://localhost:3000/admin.html`.

If `ADMIN_PASSWORD` is absent, the local-development password is `change-me-before-launch`. Never deploy with that default. Optionally set `SESSION_SECRET` to a long random value.

## Deploy

Deploy to any Node host that provides persistent disk storage. Configure:

- `ADMIN_PASSWORD` — a long unique dashboard password
- `SESSION_SECRET` — a long random string
- `PORT` — supplied by most hosting platforms automatically

The app writes guest submissions to `data/responses.json`. Attach a persistent volume at the app directory (or migrate the small storage module to a hosted database) so answers survive deployments and restarts.

## Customize

Quiz content is split into easy-to-edit files in `public/content/`:

- `drinks.csv` for result names and descriptions
- `questions.csv` for prompts and order
- `answers.csv` for answer text and order
- `scoring.csv` for readable, one-rule-per-row score weights

See `public/content/README.md` for the column-level editing guide. The app reads these CSVs directly, and the server uses the same files to validate and record each result. Existing responses retain their recorded drink result.
