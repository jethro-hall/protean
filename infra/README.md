# infra/ — the Docker estate

Everything non-app runs here, under **one common compose** (`docker-compose.yml`). See
`docs/INFRASTRUCTURE.md` for the full design and `docs/NAMING_AND_LAYOUT.md` for the standard.

## Layout
```
infra/
  docker-compose.yml     # the one compose — all non-app services
  .env.example           # copy to .env (gitignored) and fill in
  postgres/init.sql      # pgvector extension + schema bootstrap  [to add in Phase 2]
  redis/redis.conf       # cache config                           [to add]
  gateway/Dockerfile     # protean-gateway build                  [to add in Phase 0/1]
  gpu/Dockerfile         # protean-gpu (embeddings/fast-model)     [to add; VERIFY toolkit]
  sandbox/Dockerfile     # protean-sandbox base image             [to add in Phase 3+]
```

## Bring-up (POC)
```
cd infra
cp .env.example .env      # fill in PG_PASSWORD etc.
docker compose up -d protean-pg protean-cache
docker compose ps         # both healthy?
```

## Rules
Pinned tags (no `:latest`), healthchecks on every service, named volumes (`protean_<service>_data`)
under `/srv/protean/`, one network (`protean-net`), secrets from `.env`/secret-store only.
`protean-qdrant` is deferred (ADR-0002); `protean-gpu` GPU block only after `nvidia-smi` works in a
test container.
