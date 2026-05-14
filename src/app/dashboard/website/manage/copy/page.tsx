/* Legacy route — Copy editor lives inline under /dashboard/website/manage now. */
import { redirect } from 'next/navigation'
export default function CopyRedirect() { redirect('/dashboard/website/manage') }
