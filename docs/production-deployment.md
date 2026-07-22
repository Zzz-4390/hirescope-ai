# Production image publication and manual deployment

Production deployment is image-based and immutable. GitHub Actions publishes images, but it does not connect to the production server or deploy them. An operator must SSH to the server and run the deployment script manually.

## Image publication

After `Full validation` succeeds for a push to `main`, the `publish-images` matrix builds `api`, `worker`, `web`, and `migrate`. Each matrix job builds its target once and pushes the same full 40-character commit SHA tag to both registries:

```text
<ACR_PUBLIC_REGISTRY>/<ACR_NAMESPACE>/api:<commit_sha>
<ACR_PUBLIC_REGISTRY>/<ACR_NAMESPACE>/worker:<commit_sha>
<ACR_PUBLIC_REGISTRY>/<ACR_NAMESPACE>/web:<commit_sha>
<ACR_PUBLIC_REGISTRY>/<ACR_NAMESPACE>/migrate:<commit_sha>

ghcr.io/<owner>/<repository>/api:<commit_sha>
ghcr.io/<owner>/<repository>/worker:<commit_sha>
ghcr.io/<owner>/<repository>/web:<commit_sha>
ghcr.io/<owner>/<repository>/migrate:<commit_sha>
```

ACR is the production source. GHCR is a backup and is not an automatic fallback. The workflow records both registry digests in artifacts and the job summary. Every image receives `APP_COMMIT_SHA=<commit_sha>` and the OCI label `org.opencontainers.image.revision=<commit_sha>`.

The workflow uses these repository settings:

- Variables: `ACR_PUBLIC_REGISTRY`, `ACR_NAMESPACE`
- Secrets: `ACR_PUSH_USERNAME`, `ACR_PUSH_PASSWORD`

`ACR_PUBLIC_REGISTRY` must be the exact public Registry domain shown by the Hangzhou ACR console, without `http://`, `https://`, or a namespace path. Do not derive or guess a VPC Registry domain.

## Automatic CD is disabled

There is no production deployment workflow. A successful CI or image publication run never configures SSH, copies files to production, or invokes the server deployment script. The former `.github/workflows/deploy-production.yml` workflow has been removed.

## One-time server setup

Prepare the deployment files locally from the reviewed commit, then copy them to a temporary server directory:

```bash
scp docker-compose.prod.yml .env.deploy.example .github/scripts/deploy-production.sh production:/tmp/
```

After SSH login, install the files and create the deployment configuration. Keep the existing real `.env.production`; create it from `.env.production.example` only for a new server.

```bash
sudo install -d -m 700 /opt/hirescope/.deploy
sudo install -m 600 /tmp/docker-compose.prod.yml /opt/hirescope/docker-compose.prod.yml
sudo install -m 700 /tmp/deploy-production.sh /opt/hirescope/.deploy/deploy-production.sh
sudo install -m 600 /tmp/.env.deploy.example /opt/hirescope/.env.deploy
sudoedit /opt/hirescope/.env.deploy
```

Set only the exact public Registry domain and namespace in `/opt/hirescope/.env.deploy`:

```dotenv
ACR_PUBLIC_REGISTRY=<exact-public-registry-domain-from-the-ACR-console>
ACR_NAMESPACE=hirescope-ai
```

Log in to that exact ACR domain once with a production pull credential. Prefer a least-privilege pull-only account if the ACR edition supports one:

```bash
ACR_PUBLIC_REGISTRY="$(sudo sed -n 's/^ACR_PUBLIC_REGISTRY=//p' /opt/hirescope/.env.deploy)"
read -rsp 'ACR password: ' ACR_PULL_PASSWORD; echo
printf '%s' "$ACR_PULL_PASSWORD" | sudo docker login "$ACR_PUBLIC_REGISTRY" \
  --username '<ACR-pull-username>' --password-stdin
unset ACR_PULL_PASSWORD
```

The deployment user needs permission to run Docker. The server must provide Bash, Docker Compose, `curl`, `flock`, `sed`, `grep`, and GNU `timeout`.

## Manual deployment

Use the full commit SHA from a successful `main` image publication run:

```bash
sudo /opt/hirescope/.deploy/deploy-production.sh deploy <full-40-character-commit-sha>
```

The script performs this order:

1. Read the exact public ACR Registry and namespace from `/opt/hirescope/.env.deploy`.
2. Pull `migrate`, `api`, `worker`, and `web` from ACR by the full SHA tag.
3. Record their registry digests and verify every OCI revision equals the requested SHA.
4. Run the `migrate` image and wait for a successful exit.
5. Only after migration succeeds, force-recreate `api`, `worker`, and `web` with `--no-deps`.
6. Verify service health, running image IDs, runtime `APP_COMMIT_SHA`, API/Web version endpoints, and the Worker startup SHA log.
7. Record the successful SHA, image references, digests, and Compose snapshot.

The script never runs `docker build`, `docker compose build`, `pnpm build`, or `pnpm deploy`. It never force-recreates PostgreSQL, Redis, or `storage-init`.

If the new application containers fail after migration, the script attempts an application-only rollback to the last successful state. It never rolls back a migration. Migrations must therefore remain backward-compatible using the expand/contract pattern.

An explicit application rollback is available when the recorded images remain locally available or the server is authenticated to their registry:

```bash
sudo /opt/hirescope/.deploy/deploy-production.sh rollback
```

After deployment, verify the public no-cache endpoints from an operator machine:

```bash
curl -fsS -H 'Cache-Control: no-cache' "https://<production-origin>/_version?deploy_sha=<commit_sha>"
curl -fsS -H 'Cache-Control: no-cache' "https://<production-origin>/api/v1/version?deploy_sha=<commit_sha>"
```
