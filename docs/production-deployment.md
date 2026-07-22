# Production deployment contract

Production deployment is image-based and immutable. The server does not build application images. A successful `push` CI run on `main` publishes four GHCR images, each tagged only with the full 40-character commit SHA used for deployment:

```text
ghcr.io/<owner>/<repository>/api:<deploy_sha>
ghcr.io/<owner>/<repository>/worker:<deploy_sha>
ghcr.io/<owner>/<repository>/web:<deploy_sha>
ghcr.io/<owner>/<repository>/migrate:<deploy_sha>
```

The CI run records the registry digest for every image as an artifact and in the job summary. Every image receives `APP_COMMIT_SHA=<deploy_sha>` during its Docker build and the OCI label `org.opencontainers.image.revision=<deploy_sha>`. Production Compose accepts the exact references through `HIRESCOPE_API_IMAGE`, `HIRESCOPE_WORKER_IMAGE`, `HIRESCOPE_WEB_IMAGE`, and `HIRESCOPE_MIGRATE_IMAGE`; it never sets or overrides `APP_COMMIT_SHA`.

## SHA selection

Automatic deployment accepts only a successful `push` run of the repository's `CI` workflow whose `head_branch` is `main` and whose head repository is this repository. Before deployment, the SHA must still equal the current remote `main` tip. Re-running an older successful CI workflow therefore cannot deploy an older commit.

Manual deployment requires `deploy_sha`. It must be a full commit SHA, be contained in `main`, have a successful `push` CI run on `main`, and have all four SHA-tagged images available in GHCR. A missing image or invalid registry digest blocks deployment before SSH configuration or production environment approval.

## Server commands

The deployment exports the four validated SHA-tagged image references and runs these state-changing Docker commands for the normal path:

```bash
docker login ghcr.io --username <github-actor> --password-stdin
docker compose --env-file /opt/hirescope/.env.production -f <sha-compose-file> --profile migration pull migrate api worker web
docker compose --env-file /opt/hirescope/.env.production -f <sha-compose-file> --profile migration run --rm migrate
docker compose --env-file /opt/hirescope/.env.production -f <sha-compose-file> up -d --force-recreate api worker web
```

There is no unscoped `pull` or `up --force-recreate`. PostgreSQL, Redis, and `storage-init` retain their existing Compose definitions and are never selected for forced recreation. The deployment does not use `docker compose build`.

## Version verification

Before the migration runs, the server confirms the pulled `api`, `worker`, `web`, and `migrate` registry digests. After the application containers start, it verifies that the running API, Worker, and Web image IDs use those pulled images, their OCI revisions equal `deploy_sha`, and their container `APP_COMMIT_SHA` values equal `deploy_sha`.

The API exposes `GET /api/v1/version`; Web exposes `GET /_version` with both `commitSha` and the Next build ID. Web also adds `X-App-Commit-Sha` and `X-Next-Build-Id` response headers. Both version endpoints use `Cache-Control: no-store`; normal Next.js static resource caching remains unchanged. Internal and public checks add a unique query string and `Cache-Control: no-cache` request header. Worker startup logs include `Worker starting commit_sha=<deploy_sha>`.

The deployment fails unless internal API/Web responses, Worker identity, and the public production Web and API endpoints all return the exact `deploy_sha`.

## Rollback and migrations

After external verification succeeds, `/opt/hirescope/.deploy/current-success.env` records the successful SHA, four exact image references, four registry digests, and its Compose file. The former current record is preserved as `previous-success.env` for audit history.

If new application containers or external version checks fail, automatic rollback pulls and recreates only `api`, `worker`, and `web` from the last successful immutable deployment. It never recreates PostgreSQL or Redis and never runs a down migration. During the first immutable deployment, before migration, the script captures the currently running application image IDs, the locally available migrate image ID, and the server checkout SHA as a one-time rollback baseline. This lets the first transition restore only the old application containers even though the legacy images were not published to GHCR.

Database migrations must follow the expand/contract pattern: deploy backward-compatible additive changes first, migrate data safely, switch application readers/writers later, and remove old schema only in a subsequent deployment. Because migrations are not automatically reversed, an application rollback must remain compatible with the migrated database.
