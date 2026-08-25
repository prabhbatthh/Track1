# Screenshots

Page-by-page screenshots of the frontend, captured against mock data (Milestone 2 —
see [PROJECT_SPECIFICATION.md](../PROJECT_SPECIFICATION.md)). No backend integration yet,
so anything shown here is illustrative, not live data.

## Public

| Page            | Screenshot                                                         |
| --------------- | ------------------------------------------------------------------ |
| Landing         | [screenshots/landing.png](screenshots/landing.png)                 |
| Login           | [screenshots/login.png](screenshots/login.png)                     |
| Register        | [screenshots/register.png](screenshots/register.png)               |
| Forgot Password | [screenshots/forgot-password.png](screenshots/forgot-password.png) |
| 404             | [screenshots/404-not-found.png](screenshots/404-not-found.png)     |

## Member (signed in via the mock role picker on Login)

| Page             | Screenshot                                                           |
| ---------------- | -------------------------------------------------------------------- |
| Dashboard        | [screenshots/dashboard.png](screenshots/dashboard.png)               |
| Books            | [screenshots/books.png](screenshots/books.png)                       |
| Book Details     | [screenshots/book-details.png](screenshots/book-details.png)         |
| Reservations     | [screenshots/reservations.png](screenshots/reservations.png)         |
| Seat Booking     | [screenshots/seat-booking.png](screenshots/seat-booking.png)         |
| Community        | [screenshots/community.png](screenshots/community.png)               |
| Events           | [screenshots/events.png](screenshots/events.png)                     |
| Notifications    | [screenshots/notifications.png](screenshots/notifications.png)       |
| Profile          | [screenshots/profile.png](screenshots/profile.png)                   |
| Reading Progress | [screenshots/reading-progress.png](screenshots/reading-progress.png) |
| Leaderboard      | [screenshots/leaderboard.png](screenshots/leaderboard.png)           |
| Reviews          | [screenshots/reviews.png](screenshots/reviews.png)                   |
| Settings         | [screenshots/settings.png](screenshots/settings.png)                 |

## Admin

| Page            | Screenshot                                                         |
| --------------- | ------------------------------------------------------------------ |
| Admin Dashboard | [screenshots/admin-dashboard.png](screenshots/admin-dashboard.png) |

## Manager

| Page              | Screenshot                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| Manager Dashboard | [screenshots/manager-dashboard.png](screenshots/manager-dashboard.png)    |

Regenerate these any time the UI changes — there's no saved script for it in the repo;
it was a one-off Playwright pass driving the local dev server (`npm run frontend`) with
`mock-auth` seeded in `localStorage` per role.
