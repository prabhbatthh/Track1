export interface DueBook {
  id: string;
  title: string;
  dueDate: string;
  daysLeft: number;
}

// ponytail: no "my upcoming events" endpoint exists yet, so UpcomingEvents keeps
// its honest empty state — this type is the only thing still needed from here.
export interface DashboardEvent {
  id: string;
  title: string;
  date: string;
}
