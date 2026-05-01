-- Phase C.5 follow-up: video attachments support.
-- Extends the beithady-wa-media bucket to accept video MIME types
-- and raises the per-object size cap from 20MB to 100MB so guests can
-- receive short walkthrough videos (a 1080p iPhone clip is ~50MB/min;
-- Green-API's send-by-URL endpoint accepts up to 100MB per file).
update storage.buckets
set
  file_size_limit = 100 * 1024 * 1024,
  allowed_mime_types = array[
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','application/zip',
    'video/mp4','video/webm','video/quicktime','video/3gpp','video/x-msvideo','video/x-matroska'
  ]
where id = 'beithady-wa-media';
