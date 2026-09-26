curl.exe -s "https://twenty.inferencesaver.com/metadata" \
  -H "Authorization: Bearer [REDACTED_BEARER]" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ _entities(representations: [{__typename: \"ObjectMetadata\", id: \"agencyScript\"}]) { ... on ObjectMetadata { id nameSingular namePlural } } }"}'