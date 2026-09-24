/* THE GOOD TO KNOW ICONS (owner 2026-09-24, the item editor): one small line icon per tag, drawn in
   currentColor. The crossed-out ones paint a gap in --cut (the tile's ground) under the slash. */
import type { ReactNode } from 'react'

const G = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</g>
  </svg>
)
const Cut = () => (<><path d="M4 4l16 16" style={{ stroke: 'var(--cut, #fff)' }} strokeWidth="5" /><path d="M4 4l16 16" /></>)

export const TAG_ICON: Record<string, ReactNode> = {
  Spicy: <G><path d="M6.2 9.6c.3-1.6 1.8-2.6 3.6-2.4 1.9.2 3 1.4 3.6 3.6 1 3.6 3.2 6.9 7 9.1-6.6 1.3-12.4-1.9-14-7.4-.3-1-.4-2-.2-2.9z" /><path d="M8.2 7.3c-.2-2 .8-3.6 2.9-4.3" /><path d="M5.8 10.2c1.6.9 3.6.9 5.2-.2" /></G>,
  Vegan: <G><path d="M5.5 18.5C4.8 10.4 9.6 4.8 19.6 4.4c.5 9.9-5.1 15-13.2 14.9" /><path d="M4.5 20c3.2-5 6.6-8 10.8-10.2" /></G>,
  Vegetarian: <G><path d="M12 21v-8.5" /><path d="M12 12.5C12 8.6 9.2 6.2 4.6 6.2c0 4 2.8 6.3 7.4 6.3z" /><path d="M12 10.4c0-3.6 2.4-5.8 6.8-5.8 0 3.7-2.4 5.8-6.8 5.8z" /><path d="M8 21h8" /></G>,
  'Gluten free': <G><path d="M12 21V6" /><path d="M12 3.2v1.6" /><path d="M12 9.2c-2.2-.3-3.4-1.8-3.4-4 2.2.3 3.4 1.8 3.4 4zM12 9.2c2.2-.3 3.4-1.8 3.4-4-2.2.3-3.4 1.8-3.4 4z" /><path d="M12 14.2c-2.2-.3-3.4-1.8-3.4-4 2.2.3 3.4 1.8 3.4 4zM12 14.2c2.2-.3 3.4-1.8 3.4-4-2.2.3-3.4 1.8-3.4 4z" /><Cut /></G>,
  Nuts: <G><path d="M5.2 10.4h13.6c0 5.8-2.8 9.6-6.8 10.6-4-1-6.8-4.8-6.8-10.6z" /><path d="M4.6 10.4C4.6 7.2 7.8 5 12 5s7.4 2.2 7.4 5.4z" /><path d="M12 5c0-1 .5-1.8 1.4-2.2" /></G>,
  'Dairy free': <G><path d="M12 3.2c3.2 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.8-6.8 6-11z" /><Cut /></G>,
  Halal: <G><path d="M14.6 3.8A8.4 8.4 0 1 0 20.4 17a7 7 0 0 1-5.8-13.2z" /></G>,
}
