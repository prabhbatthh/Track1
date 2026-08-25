-- A member may hold at most one seat in a given date/hour slot. The service
-- checks this for friendly errors; the constraint closes concurrent races.
CREATE UNIQUE INDEX "seat_bookings_member_id_date_hour_key"
ON "seat_bookings"("member_id", "date", "hour");
