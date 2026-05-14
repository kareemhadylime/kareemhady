## 2026-05-14 — HR Training Server Actions (Sprint 9, Task 4)

**Status:** DONE

**What was done:**
- Created `src/lib/beithady/hr/hr-training-actions.ts` with five server actions:
  - `addTrainingRecordAction()` — insert new training record with validation
  - `updateTrainingRecordAction()` — update fields with optional chaining
  - `deleteTrainingRecordAction()` — delete record and attached file
  - `setTrainingRecordFileAction()` — attach file to record
  - `getTrainingRecordDownloadUrl()` — generate signed download URL (60s TTL)
- All actions use `'use server'` directive, check auth via `getCurrentUser()` and `requireBeithadyPermission('hr', 'full')`
- File storage integrated with `'hr-training'` bucket; cleanup on deletion
- `revalidatePath('/beithady/hr/training')` on mutations

**Tests:** 531 passed, 22 skipped (all passing)

**Commit:** `2bd1ae3` — feat(hr): training server actions — add, update, delete, setFile, getDownloadUrl
