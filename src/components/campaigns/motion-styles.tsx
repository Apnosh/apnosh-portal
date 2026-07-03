'use client'

/**
 * MotionStyles — the campaign surface's ONE motion system, class-based so prefers-reduced-motion can
 * turn all of it off (inline animation props cannot be media-queried). Render once per page, inside
 * the scroll container. The vocabulary, all subtle and honest:
 *   cw-stagger        sections rise in on arrival (same easing/delays as the portal Home)
 *   cw-pulseAmber     the owner-owed pulse: needs-you button + blocked timeline dot
 *   cw-pulseAmberSoft the quieter ring for the needs-your-OK card (topmost urgency moves first)
 *   cw-breathe        the current green timeline dot, slow and alive
 *   cw-ping           the live dot cue (same as Home's)
 *   cw-grow           progress bar grows to its REAL value once, on mount
 *   cw-press          tactile press on buttons (no hover lift; mobile surface)
 *   cw-det / cw-chev  disclosure chevron rotates when open
 *   cw-skel           loading skeleton shimmer
 */
export default function MotionStyles() {
  return (
    <style>{`
@keyframes cwRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.cw-stagger>*{animation:cwRise .5s cubic-bezier(.2,.7,.3,1) both}
.cw-stagger>*:nth-child(1){animation-delay:.03s}
.cw-stagger>*:nth-child(2){animation-delay:.09s}
.cw-stagger>*:nth-child(3){animation-delay:.15s}
.cw-stagger>*:nth-child(4){animation-delay:.21s}
.cw-stagger>*:nth-child(5){animation-delay:.27s}
.cw-stagger>*:nth-child(6){animation-delay:.33s}
.cw-stagger>*:nth-child(7){animation-delay:.39s}
@keyframes cwPulseA{0%,100%{box-shadow:0 6px 18px rgba(224,161,58,.35),0 0 0 0 rgba(224,161,58,.45)}50%{box-shadow:0 6px 18px rgba(224,161,58,.35),0 0 0 10px rgba(224,161,58,0)}}
.cw-pulseAmber{animation:cwPulseA 1.8s ease-out infinite}
@keyframes cwPulseASoft{0%,100%{box-shadow:0 0 0 0 rgba(224,161,58,.35)}50%{box-shadow:0 0 0 6px rgba(224,161,58,0)}}
.cw-pulseAmberSoft{animation:cwPulseASoft 1.8s ease-out infinite}
@keyframes cwPulseG{0%,100%{box-shadow:0 0 0 0 rgba(74,189,152,.45)}50%{box-shadow:0 0 0 10px rgba(74,189,152,0)}}
.cw-pulseGreen{animation:cwPulseG 1.8s ease-out infinite}
@keyframes cwBreathe{0%,100%{box-shadow:0 0 0 0 rgba(74,189,152,.30)}50%{box-shadow:0 0 0 7px rgba(74,189,152,0)}}
.cw-breathe{animation:cwBreathe 2.6s ease-in-out infinite}
.cw-ping{animation:cwBreathe 2.4s ease-out infinite}
@keyframes cwGrowX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cw-grow{transform-origin:left;animation:cwGrowX .45s cubic-bezier(.2,.7,.3,1) both}
.cw-press{transition:transform .16s cubic-bezier(.2,.7,.3,1)}
.cw-press:active{transform:scale(.98)}
.cw-det .cw-chev{transition:transform .2s cubic-bezier(.2,.7,.3,1)}
.cw-det[open] .cw-chev{transform:rotate(90deg)}
@keyframes cwSkel{0%,100%{opacity:1}50%{opacity:.5}}
.cw-skel{background:#e7e7ec;animation:cwSkel 1.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.cw-stagger>*,.cw-pulseAmber,.cw-pulseAmberSoft,.cw-pulseGreen,.cw-breathe,.cw-ping,.cw-grow,.cw-skel{animation:none}.cw-press,.cw-press:active{transition:none;transform:none}.cw-det .cw-chev{transition:none}}
`}</style>
  )
}
