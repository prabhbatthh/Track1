-- Application writes canonical lowercase emails. This database invariant also
-- protects imports/manual writes and prevents case-variant duplicate identities.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
