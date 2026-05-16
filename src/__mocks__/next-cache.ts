// Vitest shim for next/cache — revalidatePath and revalidateTag are no-ops
// outside the Next.js request context.
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const unstable_cache = <T extends (...args: unknown[]) => unknown>(fn: T) => fn;
export const unstable_noStore = () => {};
