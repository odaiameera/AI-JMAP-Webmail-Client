-- Server-side cache of resolved sender/company avatars. Lives on the
-- persistent /data volume so every browser/device shares one fetch and a
-- fresh browser loads instantly without re-hitting the network.
--
-- Keyed by the granularity at which the network call happens:
--   key = 'domain:<domain>'    → BIMI / favicon result (shared by all
--                                 addresses at that domain)
--   key = 'gravatar:<email>'   → Gravatar result for one address
--
-- A 'missing' row negative-caches lookups that found nothing, so the
-- resolver doesn't pound the network on every render. Image bytes are
-- stored inline (avatars are small: favicons, BIMI SVGs, gravatars
-- requested at <=160px); a size cap is enforced before insert.
CREATE TABLE IF NOT EXISTS avatar_cache (
	key          TEXT PRIMARY KEY,
	status       TEXT NOT NULL,        -- 'found' | 'missing'
	source       TEXT,                 -- 'bimi' | 'favicon' | 'gravatar'
	content_type TEXT,
	bytes        BLOB,
	fetched_at   INTEGER NOT NULL      -- epoch ms
);
