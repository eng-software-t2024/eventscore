# EventScore release candidate

This recipe prepares, but does not publish, the coordinated candidate:

- API source: `bcde18e06a499a7171fd50d30a3eca9c9673aed8`.
- Official frontend source: `154a670195e1645358fc16a01c3277e84b72768f` (merge commit of PR #55).
- Recipe branch base: `154a670195e1645358fc16a01c3277e84b72768f` (current main at preparation time).
- Images target `linux/amd64`, matching the inspected VPS architecture.
- API runtime runs as `node`, uses generated Prisma Client, and receives `DATABASE_URL` and `JWT_SECRET` only from runtime configuration.
- Frontend serves the built SPA with history fallback and proxies `/api/v1/` to the existing `api:3000` service on the internal `eventscore_default` network.
- Frontend proposal: `https://eventscore.olua.me`; no ingress, DNS, or Cloudflare changes are made by this package.

## Rebuild and checksum

Run from this repository checkout with both source commits available locally. To reuse the already-built, checksum-verified API image without rebuilding it, pass the prior package directory as the second argument:

```sh
deploy/release/build-artifacts.sh /home/olua-dev/audit-reports/eventscore-release-bcde18e-154a670-2026-11-22/package-final-pr55-v3 /home/olua-dev/audit-reports/eventscore-release-bcde18e-17d31c7-2026-11-21/package-final-v3
cd /home/olua-dev/audit-reports/eventscore-release-bcde18e-154a670-2026-11-22/package-final-pr55-v3
sha256sum -c SHA256SUMS
```

Reuse mode verifies the previous package checksum file, copies its API archive unchanged, and loads that archive only for image identity reporting. It builds only the frontend at the fixed merge SHA. Without the prior-package argument, the recipe can build both images. Both paths use pinned base-image digests; temporary source contexts are removed on exit. The source revisions and recipe remain distinct in the image labels and manifest.

Before approving deployment, transfer only the verified files to `/home/olua_developer/release-staging/eventscore` on the VPS, run `sha256sum -c`, and inspect the loaded image IDs, digests, architecture, user, healthcheck, and revision labels. That staging directory does not exist yet; creating it and transferring files are future deployment-window actions. The SSH account can write its home directory, while the current Compose project is root-owned and must be read through `sudo`. Do not put secrets in the archive or the static frontend.

## First administrator

The supported command is `npm run db:admin` from the API checkout. It requires a personally chosen display name, email, and password of at least 12 characters. The script rejects the public default and does not replace an existing account unless separately asked. Do not create the account during artifact preparation. The exact interactive command for the approved API container is:

```sh
ssh -t koss-vps
sudo docker compose -f /home/olua_developer/eventscore-backend/compose.yaml exec -it api sh -c '
  printf "Nome: "; IFS= read -r ADMIN_NOME
  printf "E-mail: "; IFS= read -r ADMIN_EMAIL
  printf "Senha (mínimo 12 caracteres): "
  trap "stty echo" EXIT
  stty -echo
  IFS= read -r ADMIN_SENHA
  stty echo
  trap - EXIT
  export ADMIN_NOME ADMIN_EMAIL ADMIN_SENHA
  npm run db:admin
  result=$?
  unset ADMIN_NOME ADMIN_EMAIL ADMIN_SENHA
  exit "$result"
'
```

Enter the password only at the hidden interactive prompt. It is not part of the command line, shell history, or output. Supply the exact display name and email before the window; never put a password in chat or a log.

The EventScore API has its own JWT login and is not authenticated by Supabase Auth. No administrator account or production data is created by these image builds.

## Deployment outline (after separate approval)

The exact server files must first be staged and reviewed. Validate both Compose models without printing `.env` values. Then load the transferred Docker archives and run `docker image inspect` against the exact tags. Keep the currently running API image ID/digest and Compose files unchanged for rollback.

For the API, use the existing project and Compose file at `/home/olua_developer/eventscore-backend/compose.yaml` with `deploy/release/compose.api.override.yaml`, and change only service `api`:

```sh
ssh koss-vps 'install -d -m 700 "$HOME/release-staging/eventscore"'
scp /home/olua-dev/audit-reports/eventscore-release-bcde18e-154a670-2026-11-22/package-final-pr55-v3/{eventscore-api-bcde18e.tar,eventscore-web-154a670.tar,compose.api.override.yaml,compose.api.rollback.yaml,compose.web.yaml,image-identities.txt,SHA256SUMS} \
  koss-vps:/home/olua_developer/release-staging/eventscore/
ssh koss-vps 'cd "$HOME/release-staging/eventscore" && sha256sum -c SHA256SUMS && sudo docker load -i eventscore-api-bcde18e.tar && sudo docker load -i eventscore-web-154a670.tar'
ssh koss-vps "sudo docker image inspect localhost/eventscore-api:bcde18e-20261121 localhost/eventscore-web:154a670 --format '{{.Id}} RepoDigests={{if .RepoDigests}}{{json .RepoDigests}}{{else}}none (no repository digest){{end}} {{.Os}}/{{.Architecture}} User={{if index .Config \"User\"}}{{index .Config \"User\"}}{{else}}(default){{end}} Healthcheck={{json (index .Config \"Healthcheck\")}} Labels={{json (index .Config \"Labels\")}}'"
ssh koss-vps 'sudo docker compose -f /home/olua_developer/eventscore-backend/compose.yaml -f /home/olua_developer/release-staging/eventscore/compose.api.override.yaml config --quiet'
ssh koss-vps 'sudo docker compose -f /home/olua_developer/eventscore-backend/compose.yaml -f /home/olua_developer/release-staging/eventscore/compose.api.override.yaml up -d --no-deps --no-build --pull never api'
```

For the frontend, the Compose file sets a separate project name `eventscore-web`. After validating its configuration against the existing `eventscore_default` and `traefik-public` networks:

```sh
ssh koss-vps 'sudo docker compose -f /home/olua_developer/release-staging/eventscore/compose.web.yaml config --quiet'
ssh koss-vps 'sudo docker compose -f /home/olua_developer/release-staging/eventscore/compose.web.yaml up -d --no-deps --no-build --pull never web'
```

Before any ingress reload, confirm the Traefik router and public route with the infrastructure owner. This candidate's labels prepare the intended host route; they do not prove that the existing tunnel or ingress accepts it. Do not change DNS, Cloudflare, or Tailnet as part of this runbook.

Check the API health endpoint, login, authenticated `/api/v1` calls, SPA deep-link reload, API proxy, and PDF/XLSX downloads. The database already has the approved schema; this deployment runs no migrations.

### Rollback

- Frontend only: run `ssh koss-vps 'sudo docker compose -f /home/olua_developer/release-staging/eventscore/compose.web.yaml stop web'` and then `ssh koss-vps 'sudo docker compose -f /home/olua_developer/release-staging/eventscore/compose.web.yaml rm -f web'`. No database change is involved.
- API only: use `compose.api.rollback.yaml` (which pins the currently running image digest), validate it with `docker compose config --quiet`, then recreate only `api` with `--no-deps --no-build --pull never`. Do not substitute a floating tag. The exact command is `ssh koss-vps 'sudo docker compose -f /home/olua_developer/eventscore-backend/compose.yaml -f /home/olua_developer/release-staging/eventscore/compose.api.rollback.yaml config --quiet && sudo docker compose -f /home/olua_developer/eventscore-backend/compose.yaml -f /home/olua_developer/release-staging/eventscore/compose.api.rollback.yaml up -d --no-deps --no-build --pull never api'`.
- Do not restore the database as an application rollback. No migrations are part of this release, and database restore is a separate recovery decision.
- The prior API image is not functionally equivalent to the candidate main revision; API rollback may restore old behavior while the migrated database remains current.

## Validation boundaries

The frontend's automated checks and browser checks, API tests, migrations, and disposable database evidence are recorded alongside the release report. Manual PDF text extraction is not part of CI. PR #55 fixes loading and saving an event configuration with `penalidadeMin`/`penalidadeMax` set to `null`, and keeps penalty submission blocked until a valid range is configured. Challenge listing/creation/edit endpoints are present in the candidate; the targeted UI test that showed the “not available” message used an intentionally intercepted synthetic 404 and was not evidence that the real challenge route is missing.
