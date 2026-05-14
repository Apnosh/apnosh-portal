/* Legacy route — Menu editor lives inline under /dashboard/website/manage now. */
import { redirect } from 'next/navigation'
export default function MenuRedirect() { redirect('/dashboard/website/manage') }
