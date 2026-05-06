import { setUserDisplayNameAction } from '../actions';

export function DisplayNameForm({
  userId,
  current,
}: {
  userId: string;
  current: string | null;
}) {
  return (
    <form action={setUserDisplayNameAction} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="display_name"
        defaultValue={current ?? ''}
        placeholder="Display name (optional)"
        maxLength={80}
        className="ix-input text-xs flex-1"
      />
      <button type="submit" className="ix-btn-secondary text-xs">
        Save name
      </button>
    </form>
  );
}