BEGIN;

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);

DO $$
DECLARE
  existing_user RECORD;
  base_username TEXT;
  candidate_username TEXT;
  suffix_number INTEGER;
  suffix_text TEXT;
BEGIN
  FOR existing_user IN
    SELECT "id", "email"
    FROM "users"
    ORDER BY "created_at", "id"
  LOOP
    base_username := lower(split_part(existing_user."email", '@', 1));
    base_username := regexp_replace(base_username, '[^a-z0-9_]+', '_', 'g');
    base_username := btrim(base_username, '_');

    IF char_length(base_username) < 3 THEN
      base_username := 'user_' || base_username;
    END IF;

    base_username := left(base_username, 30);
    candidate_username := base_username;
    suffix_number := 2;

    WHILE EXISTS (SELECT 1 FROM "users" WHERE "username" = candidate_username) LOOP
      suffix_text := '_' || suffix_number::TEXT;
      candidate_username := left(base_username, 30 - char_length(suffix_text)) || suffix_text;
      suffix_number := suffix_number + 1;
    END LOOP;

    UPDATE "users"
    SET "username" = candidate_username
    WHERE "id" = existing_user."id";
  END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

ALTER TABLE "users"
  ADD CONSTRAINT "users_username_normalized_check"
  CHECK (
    "username" = lower(btrim("username"))
    AND "username" ~ '^[a-z0-9_]{3,30}$'
  );

COMMIT;
