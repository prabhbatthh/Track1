SEAT_ROWS = ["A", "B", "C", "D"]
SEATS_PER_ROW = 8
SEAT_LABELS = [f"{row}{n}" for row in SEAT_ROWS for n in range(1, SEATS_PER_ROW + 1)]

# Bookable window: today plus this many additional days.
MAX_DAYS_AHEAD = 2
