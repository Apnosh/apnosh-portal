/* Legacy route — Photos editor lives inline under /dashboard/website/manage now. */
import { redirect } from 'next/navigation'
export default function PhotosRedirect() { redirect('/dashboard/website/manage') }
