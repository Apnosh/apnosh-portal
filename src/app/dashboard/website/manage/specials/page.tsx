/* Legacy route — Specials editor lives inline under /dashboard/website/manage now. */
import { redirect } from 'next/navigation'
export default function SpecialsRedirect() { redirect('/dashboard/website/manage') }
