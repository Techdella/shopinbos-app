import { redirect } from 'next/navigation';
import { getClaims } from '@/lib/auth/claims';

export const dynamic = 'force-dynamic';

export default async function Index() {
  redirect((await getClaims()) ? '/home' : '/sign-in');
}
