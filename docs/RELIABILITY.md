# Staying up

## The "Application error: a server-side exception" crash

Admin pages check the sign-in against the database on every load. The database address used Supabase's **session**
pooler (port 5432), which allows only a handful of connections in total. A serverless host starts several copies of
the app, so busy moments (the admin panel refreshes often) ran out of connections and the page crashed.

- On Vercel the app now uses the **transaction** pooler (port 6543, same host, user and password) whatever port is
  configured (`src/lib/dbResilience.js`). No environment change is needed.
- A read that cannot reach the database is retried twice before failing. Writes are never repeated.
- If a page still fails, it shows "Connection problem" and tries again by itself instead of the blank crash screen.

## Speed

- `vercel.json` runs the server in Singapore (`sin1`), next to the database. It ran in the US before, so every
  database query crossed the world twice. Check Vercel > Settings > Functions after deploying.
- The order pages read their details side by side instead of one after another.

## If it happens again

Vercel > the project > Logs, and search for the "Reference" number shown on the error screen.
