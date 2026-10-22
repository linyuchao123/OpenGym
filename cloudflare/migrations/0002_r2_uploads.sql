-- R2 objects retain a D1 reservation until deletion/abort has been confirmed.
CREATE TABLE IF NOT EXISTS media_uploads (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
 name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0 AND size<=209715200),
 object_key TEXT NOT NULL UNIQUE, upload_id TEXT, hashes TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','uploading','finalizing','ready','aborting','aborted','deleted')),
 created INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_uploads_owner ON media_uploads(owner,status);
CREATE INDEX IF NOT EXISTS media_uploads_expiry ON media_uploads(status,expires);
CREATE UNIQUE INDEX IF NOT EXISTS media_uploads_retry ON media_uploads(owner,fingerprint) WHERE status NOT IN ('aborted','deleted');
CREATE TABLE IF NOT EXISTS media_upload_parts (
 upload TEXT NOT NULL REFERENCES media_uploads(id), number INTEGER NOT NULL,
 etag TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(upload,number)
);
CREATE TRIGGER IF NOT EXISTS cap_r2_reservation BEFORE INSERT ON media_uploads BEGIN
 SELECT CASE WHEN COALESCE((SELECT SUM(size) FROM blobs),0)+COALESCE((SELECT SUM(size) FROM media_uploads WHERE status NOT IN ('aborted','deleted')),0)+NEW.size>8589934592 THEN RAISE(ABORT,'site-media-full') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(size) FROM blobs WHERE owner=NEW.owner),0)+COALESCE((SELECT SUM(size) FROM media_uploads WHERE owner=NEW.owner AND status NOT IN ('aborted','deleted')),0)+NEW.size>1073741824 THEN RAISE(ABORT,'user-media-full') END;
END;
-- Legacy clients keep their old limits and count towards the combined cap.
CREATE TRIGGER IF NOT EXISTS cap_legacy_with_r2 BEFORE INSERT ON blobs BEGIN
 SELECT CASE WHEN COALESCE((SELECT SUM(size) FROM blobs),0)+COALESCE((SELECT SUM(size) FROM media_uploads WHERE status NOT IN ('aborted','deleted')),0)+NEW.size>8589934592 THEN RAISE(ABORT,'site-media-full') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(size) FROM blobs WHERE owner=NEW.owner),0)+COALESCE((SELECT SUM(size) FROM media_uploads WHERE owner=NEW.owner AND status NOT IN ('aborted','deleted')),0)+NEW.size>1073741824 THEN RAISE(ABORT,'user-media-full') END;
END;
