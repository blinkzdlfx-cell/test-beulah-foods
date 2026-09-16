# Beulah Foods — Environment Contract

## Environment flow

```text
Development → Staging → Production
```

Each environment must use independent mutable resources and credentials.

## Resource matrix

| Resource | Development | Staging | Production |
|---|---|---|---|
| Git branch | developer/local | `reconstruction` | controlled release branch/main |
| Supabase | local/approved dev | `cveghsjotmfygknqyvxg` | production project |
| Cloudflare Worker | local/dev or approved dev | dedicated staging Worker | `beulah-foods` |
| Paystack | test credentials | test credentials | production credentials |
| Email | dev/test sender | staging sender/config | production sender/config |
| Storage | dev bucket/project | staging bucket/project | production bucket/project |

## Staging Supabase

Project ref:

```text
cveghsjotmfygknqyvxg
```

Project URL:

```text
https://cveghsjotmfygknqyvxg.supabase.co
```

The staging project must remain isolated from production data and credentials.

## Browser configuration

Browser code may contain only the Supabase URL and public anon key for the active environment. It must never contain:

- Supabase service-role key.
- Paystack secret key.
- Resend API key.
- Other server credentials.

The current production application embeds production Supabase browser configuration. Reconstruction must replace this with environment-specific configuration before staging is deployed.

## Worker configuration

The Worker is a trusted backend boundary as well as the static host/router.

Staging Worker secrets/bindings must be independent from production:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PAYSTACK_SECRET_KEY
RESEND_API_KEY
RESEND_FROM
```

Exact values are supplied through deployment secrets/configuration and must not be committed to Git.

## URL rules

Production URLs must not be hardcoded into staging runtime behavior. This includes:

- API origins.
- Canonical URLs.
- Open Graph URLs.
- Structured-data URLs.
- Payment callback URLs.
- Auth redirect URLs.

Runtime-generated origins should be preferred where the application needs the current deployment origin.

## Promotion rule

Promotion is not a database-pointer switch and is not a staging-to-production credential reuse operation.

The tested staging implementation becomes the candidate production implementation only after:

1. Staging tests pass.
2. Business-flow verification passes.
3. Security verification passes.
4. Migration plan is reviewed.
5. Production backup/rollback procedure is confirmed.
6. Explicit production approval is given.
7. Production resources are updated deliberately.
8. Production smoke tests pass.

Until those conditions are met, production remains untouched.
