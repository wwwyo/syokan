# Snapshot Envelope

- When removing a field from the snapshot envelope, project stored snapshots through the current response shape on every read path, including `get()` and idempotent POST/dedup returns; old JSON files are parsed without schema revalidation, so legacy keys can otherwise leak back into API/UI behavior even after POST validation rejects them.
