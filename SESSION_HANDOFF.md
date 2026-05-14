## 2026-05-14 — HR Documents Actions (Sprint 8, Task 4)

**Status:** COMPLETE

**File created:**
- `src/lib/beithady/hr/hr-documents-actions.ts` — Server actions for HR document management
  - `addDocumentAction()` — insert new document record with auth check
  - `updateDocumentAction()` — update document metadata (doc_type, title, dates, notes)
  - `deleteDocumentAction()` — delete document and clean up storage
  - `setDocumentFileAction()` — update file_path and file_name after upload
  - `getDocumentDownloadUrl()` — generate 60-second signed URL for download

**Tests:** All 527 tests passing ✓

**Commit:** `584e913` feat(hr): documents server actions — add, update, delete, setFile, getDownloadUrl

**Deploy:** GitHub push to main complete. Vercel deploy running with `--archive=tgz` (file count issue on initial attempt).

**Next:** UI components for document upload/management in Sprint 8, Task 5.
