import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployeeDocuments } from '@/lib/beithady/hr/hr-documents-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employee_id = request.nextUrl.searchParams.get('employee_id');
  if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  const docs = await getEmployeeDocuments(employee_id);
  return NextResponse.json({ docs });
}
