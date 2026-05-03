import { redirect } from 'next/navigation';

export default function SetupIndex() {
  redirect('/personal/email/setup/accounts');
}
