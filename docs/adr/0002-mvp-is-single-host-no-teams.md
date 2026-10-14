# Single-Host MVP; team and collective booking deferred

The MVP models exactly one Host per account. No team, organization, or member concept exists in the domain or the schema; the Host dashboard therefore contains no team blocks — no "events of colleagues", no collective scheduling link, no round-robin. The glossary reserves the term *Team* as explicitly out of scope.

## Consequences

- Every Meeting Type, Availability, and Booking has exactly one Host; there is no owner-collection to scope queries by.
- Collective booking (round-robin, team pages) is a future feature, and adding it later will require introducing the Team concept plus a shared-availability model — a data-model change, not a UI one.
- API endpoints stay flat under `/hosts/me` rather than `/teams/{id}/...`.
