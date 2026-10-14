# The public surface is a Guest-facing booking page; the dashboard belongs to the Host

The main page serves two audiences, so "главная страница" alone is ambiguous. Decided: the main app page is the **authenticated Host dashboard** (upcoming bookings, quick actions, links to Meeting Types), and the Guest-facing **Booking Page** is a separate public, unauthenticated surface — not a variant of the dashboard, and not a marketing landing page.

## Considered Options

- **Single combined page** for both Host and Guest: rejected. Different auth states, different jobs; mixing them couples every future Guest-side change to the authenticated app shell.
- **Public marketing landing as the main page**: rejected for the current scope. The product's core loop is Host configures → Guest books; the landing page is growth surface, not the main page.

## Consequences

- Two route trees: `/dashboard/*` (authenticated Host) and public Booking Page routes. The API separates host endpoints (auth required) from guest endpoints (public).
- The word "main page" in specs always means the Host dashboard; Guest-facing screens get their own names per `GLOSSARY.md`.
