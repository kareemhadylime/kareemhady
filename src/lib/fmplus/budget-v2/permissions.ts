/**
 * FM+ Budget v2 Permission Gates
 *
 * Enforces application-level access control. All DB-level RLS policies
 * are supplemented by these client-side guards to provide clear, consistent
 * permission checks and audit points.
 *
 * Pattern: Check locally before making any mutation. On read, RLS filters
 * results transparently at the DB level.
 *
 * Typed Supabase clients passed in from caller (browser or server context).
 */

/**
 * Permission result wrapper: success flag + optional error message
 */
export type PermissionResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Budget permissions summary for a user
 */
export type BudgetPermissions = {
  canCreateContract: boolean;
  canEditContracts: string[]; // contract IDs
  canViewContracts: string[]; // contract IDs
  canDeleteContracts: string[]; // contract IDs
  canManageCatalog: boolean; // admin only
};

// =====================================================================
// CONTRACT PERMISSIONS
// =====================================================================

/**
 * Check if user can view a contract. Inline check + DB fallback.
 * @param supabase - Typed Supabase client (browser or server)
 * @param contractId - Contract to check
 * @param userId - User ID from auth session
 */
export async function budgetCanViewContract(
  supabase: any,
  contractId: bigint,
  userId: string | undefined
): Promise<PermissionResult> {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc(
      'budget_can_view_contract',
      { p_contract_id: contractId }
    );

    if (error) {
      console.error('budget_can_view_contract failed:', error);
      return { allowed: false, reason: error.message };
    }

    return { allowed: data === true };
  } catch (err: any) {
    return { allowed: false, reason: err.message };
  }
}

/**
 * Check if user can edit a contract (includes create, update, delete)
 */
export async function budgetCanEditContract(
  supabase: any,
  contractId: bigint,
  userId: string | undefined
): Promise<PermissionResult> {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc(
      'budget_can_edit_contract',
      { p_contract_id: contractId }
    );

    if (error) {
      console.error('budget_can_edit_contract failed:', error);
      return { allowed: false, reason: error.message };
    }

    return { allowed: data === true };
  } catch (err: any) {
    return { allowed: false, reason: err.message };
  }
}

/**
 * Check if user can create a new contract (always allowed if authenticated)
 */
export function budgetCanCreateContract(
  userId: string | undefined
): PermissionResult {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }
  return { allowed: true };
}

/**
 * Check if user can delete a contract (same as edit)
 */
export async function budgetCanDeleteContract(
  supabase: any,
  contractId: bigint,
  userId: string | undefined
): Promise<PermissionResult> {
  return budgetCanEditContract(supabase, contractId, userId);
}

// =====================================================================
// YEAR PERMISSIONS
// =====================================================================

/**
 * Check if user can edit/create a year (requires contract ownership)
 */
export async function budgetCanEditYear(
  supabase: any,
  yearId: bigint,
  userId: string | undefined
): Promise<PermissionResult> {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  try {
    const { data, error } = await supabase.rpc(
      'budget_can_edit_year',
      { p_year_id: yearId }
    );

    if (error) {
      console.error('budget_can_edit_year failed:', error);
      return { allowed: false, reason: error.message };
    }

    return { allowed: data === true };
  } catch (err: any) {
    return { allowed: false, reason: err.message };
  }
}

/**
 * Check if user can create a year under a contract
 */
export async function budgetCanCreateYear(
  supabase: any,
  contractId: bigint,
  userId: string | undefined
): Promise<PermissionResult> {
  // Creating a year requires contract ownership
  return budgetCanEditContract(supabase, contractId, userId);
}

// =====================================================================
// CATALOG PERMISSIONS
// =====================================================================

/**
 * Check if user can manage the FM+ catalog (admin only)
 * This is enforced via the provider='admin' check in RLS.
 */
export async function budgetCanManageCatalog(
  supabase: any,
  userId: string | undefined
): Promise<PermissionResult> {
  if (!userId) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('provider')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Failed to fetch account:', error);
      return { allowed: false, reason: error.message };
    }

    const isAdmin = data?.provider === 'admin';
    return {
      allowed: isAdmin,
      reason: isAdmin ? undefined : 'User is not an admin',
    };
  } catch (err: any) {
    return { allowed: false, reason: err.message };
  }
}

// =====================================================================
// BATCH PERMISSION CHECKS
// =====================================================================

/**
 * Load all user's contracts and compute permission summary
 */
export async function budgetLoadUserPermissions(
  supabase: any,
  userId: string | undefined
): Promise<BudgetPermissions> {
  const perms: BudgetPermissions = {
    canCreateContract: !!userId,
    canEditContracts: [],
    canViewContracts: [],
    canDeleteContracts: [],
    canManageCatalog: false,
  };

  if (!userId) {
    return perms;
  }

  try {
    // Load user's contracts via the RLS-aware function
    const { data: contracts, error: contractError } = await supabase.rpc(
      'budget_user_contracts'
    );

    if (contractError) {
      console.error('Failed to load user contracts:', contractError);
      return perms;
    }

    if (Array.isArray(contracts)) {
      const ids = contracts.map((c: any) => String(c.id));
      perms.canViewContracts = ids;
      perms.canEditContracts = ids;
      perms.canDeleteContracts = ids;
    }

    // Check catalog admin
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('provider')
      .eq('id', userId)
      .single();

    if (!accountError && account?.provider === 'admin') {
      perms.canManageCatalog = true;
    }
  } catch (err: any) {
    console.error('Error loading permissions:', err);
  }

  return perms;
}

// =====================================================================
// PERMISSION ASSERTION HELPERS
// =====================================================================

/**
 * Throw if user cannot perform action (for server actions/API routes)
 */
export async function assertCanEditContract(
  supabase: any,
  contractId: bigint,
  userId: string | undefined
): Promise<void> {
  const perm = await budgetCanEditContract(supabase, contractId, userId);
  if (!perm.allowed) {
    throw new Error(
      `Not authorized to edit contract ${contractId}: ${perm.reason}`
    );
  }
}

export async function assertCanEditYear(
  supabase: any,
  yearId: bigint,
  userId: string | undefined
): Promise<void> {
  const perm = await budgetCanEditYear(supabase, yearId, userId);
  if (!perm.allowed) {
    throw new Error(`Not authorized to edit year ${yearId}: ${perm.reason}`);
  }
}

export async function assertCanManageCatalog(
  supabase: any,
  userId: string | undefined
): Promise<void> {
  const perm = await budgetCanManageCatalog(supabase, userId);
  if (!perm.allowed) {
    throw new Error(
      `Not authorized to manage catalog: ${perm.reason || 'unknown reason'}`
    );
  }
}

// =====================================================================
// CONTEXT HELPERS
// =====================================================================

/**
 * Extract user ID from Supabase auth session
 */
export async function budgetGetAuthUserId(
  supabase: any
): Promise<string | undefined> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Check permission inline (browser context)
 * Returns false silently if any check fails
 */
export async function budgetCheckPermission(
  supabase: any,
  check: 'create' | 'view' | 'edit' | 'delete',
  targetId?: bigint,
  userId?: string
): Promise<boolean> {
  if (!userId || !targetId) {
    return check === 'create';
  }

  try {
    switch (check) {
      case 'create':
        return budgetCanCreateContract(userId).allowed;
      case 'view':
        return (
          await budgetCanViewContract(supabase, targetId, userId)
        ).allowed;
      case 'edit':
        return (
          await budgetCanEditContract(supabase, targetId, userId)
        ).allowed;
      case 'delete':
        return (
          await budgetCanDeleteContract(supabase, targetId, userId)
        ).allowed;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
