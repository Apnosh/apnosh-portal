/**
 * es — the product in Spanish, written the way the owner would say it.
 *
 * The ten Spanish-speaking owners in the walk run a taqueria, a pupuseria, a panaderia. They are
 * in the United States, so the register is Mexican and Central American, the money is dollars,
 * and the reading level is fifth grade. Rules this file follows:
 *
 *   · Tú, never usted. We are their team, not their bank.
 *   · Their words, not marketing's. "Más gente entrando", not "incrementar el tráfico".
 *   · Short. If the English is six words the Spanish should not be twelve.
 *   · Nothing invented. A line that promises something the code does not do is a lie in two
 *     languages instead of one, so every string here says exactly what its English key says.
 *   · No borrowed English. It is "cómo llegar", not "direcciones"; "reseñas", not "reviews".
 *
 * The key is the English sentence (see t.ts). A key that is missing here renders its English,
 * so nothing can go blank; scripts/verify-i18n.ts is what proves nothing on the translated
 * screens is missing.
 */

export const ES: Record<string, string> = {
  /* ── Home: the funnel's five stages ───────────────────────────────────────────────────── */
  'Awareness': 'Te vieron',
  'Interest': 'Miraron más',
  'Actions': 'Hicieron algo',
  'Orders': 'Pedidos',
  'Retention': 'Volvieron',
  'times you showed up on Google': 'veces que apareciste en Google',
  'times you showed up on Google and social': 'veces que apareciste en Google y en redes',
  'website visits & clicks': 'visitas y clics a tu página',
  'directions & calls': 'cómo llegar y llamadas',
  'walk-in orders from Google': 'pedidos en el local que salieron de Google',
  'came back for more': 'volvieron por más',

  /* ── Home: the same five stages, in the words of a truck, a kitchen, a caterer ─────────── */
  'directions & calls to the truck': 'cómo llegar y llamadas al camión',
  'orders at the truck from Google': 'pedidos en el camión que salieron de Google',
  'Orders you took at the truck, counted from the people Google sent you.': 'Pedidos que tomaste en el camión, contados de la gente que te mandó Google.',
  'found you again': 'te volvieron a encontrar',
  'calls & clicks': 'llamadas y clics',
  'delivery orders from Google': 'pedidos a domicilio que salieron de Google',
  'Delivery orders that started on Google, from your own site or your delivery apps.': 'Pedidos a domicilio que empezaron en Google, desde tu página o desde tus apps de entrega.',
  'ordered again': 'volvieron a pedir',
  'walk-in orders from Google, this shop': 'pedidos en el local que salieron de Google, esta tienda',
  'catering orders that started on Google': 'pedidos de banquete que empezaron en Google',
  'Catering jobs that started with someone finding you on Google.': 'Trabajos de banquete que empezaron porque alguien te encontró en Google.',
  'booked you again': 'te volvieron a contratar',
  'walk-in orders from Google this season': 'pedidos en el local que salieron de Google esta temporada',

  /* ── Home: nothing connected yet ──────────────────────────────────────────────────────── */
  'Your numbers show here': 'Aquí salen tus números',
  'Connect your Google Business Profile and this fills with real calls, directions and reviews. Never made-up numbers.': 'Conecta tu Perfil de Negocio de Google y esto se llena con llamadas, cómo llegar y reseñas de verdad. Nunca números inventados.',
  'Connect your Google Business Profile and this fills with real calls, clicks and reviews. Never made-up numbers.': 'Conecta tu Perfil de Negocio de Google y esto se llena con llamadas, clics y reseñas de verdad. Nunca números inventados.',
  'Connect accounts': 'Conectar cuentas',

  /* ── Home: the time ranges ────────────────────────────────────────────────────────────── */
  'Last 7 days': 'Últimos 7 días',
  'Last 30 days': 'Últimos 30 días',
  'Last 90 days': 'Últimos 90 días',
  'Last year': 'Último año',
  'Custom': 'A tu gusto',

  /* ── Home: what we counted, and who is on your work ───────────────────────────────────── */
  'Counted, as promised': 'Contado, como prometimos',
  'Before and after on your whole listing. It shows what happened, not proof of cause.': 'Antes y después en todo tu perfil. Muestra lo que pasó, no que haya sido por esto.',
  'The people on your work': 'Las personas en tu trabajo',
  'Get help': 'Pedir ayuda',
  'A real person replies within one business day.': 'Una persona de verdad te contesta en un día hábil.',
  '{n} pieces of work': '{n} trabajos',

  /* ── The reply promise, and the clock on it ───────────────────────────────────────────── */
  'within one business day': 'en un día hábil',
  'Sent': 'Enviado',
  'we answer': 'contestamos',
  'due': 'para el',
  'Answered in': 'Contestado en',

  /* ── Get help ─────────────────────────────────────────────────────────────────────────── */
  'A real person answers': 'Te contesta una persona',
  'Talk to us': 'Habla con nosotros',
  'Message us': 'Mándanos un mensaje',
  'We reply within one business day': 'Contestamos en un día hábil',
  'Share feedback': 'Danos tu opinión',
  'Tell us what to make better': 'Dinos qué podemos mejorar',
  'Find it yourself': 'Búscalo tú mismo',
  'Questions and answers': 'Preguntas y respuestas',
  'The papers': 'Los papeles',
  'Your agreements': 'Tus acuerdos',

  /* ── Settings: the language row ───────────────────────────────────────────────────────── */
  'Language': 'Idioma',
  'Pick the language you want to read.': 'Escoge el idioma en que quieres leer.',
  'Saved.': 'Guardado.',
  'Could not save. Try again.': 'No se pudo guardar. Inténtalo otra vez.',
  'Some screens are still in English. We are working on the rest.': 'Algunas pantallas siguen en inglés. Estamos trabajando en las demás.',

  /* ── Create: the shelf's own words ────────────────────────────────────────────────────── */
  'For you': 'Para ti',
  'For a truck': 'Para un camión',
  'For delivery only': 'Solo entregas',
  'For this shop': 'Para esta tienda',
  'For catering': 'Para banquetes',
  'For the season': 'Para la temporada',
  'Set a budget': 'Pon un presupuesto',
  'Up to {amount} to start': 'Hasta {amount} para empezar',
  'Above {amount} to start': 'Más de {amount} para empezar',
  '{n} more, once you raise it': '{n} más, cuando lo subas',
  'Raise budget': 'Sube el presupuesto',
  'Coming later for this goal': 'Todavía no está listo para esta meta',
  'Tell me when': 'Avísame',
  'Nothing here yet for this one.': 'Todavía no hay nada para esta.',
  'Everything we could do for it is below, with the reason it is not ready.': 'Abajo está todo lo que podríamos hacer, con la razón por la que no está listo.',
  'What feels right to start?': '¿Con cuánto te sientes bien para empezar?',
  'You can change it any time. Nothing is charged now.': 'Lo puedes cambiar cuando quieras. Ahora no se cobra nada.',
  'No cap set. Everything shows.': 'Sin tope. Se muestra todo.',

  /* ── The fourteen goal chips, asked in setup and shown on Create ──────────────────────── */
  'More customers on slow days': 'Más clientes en los días flojos',
  'More foot traffic overall': 'Más gente entrando en general',
  'Build local awareness': 'Que me conozcan aquí cerca',
  'Promote a specific offering': 'Promover un platillo o un servicio',
  'Grow social following': 'Tener más seguidores',
  'Improve online reputation': 'Mejorar mi fama en internet',
  'Launch something new': 'Lanzar algo nuevo',
  'Stay top of mind': 'Que no se olviden de mí',
  'Compete with nearby businesses': 'Competir con los negocios de al lado',
  'More bookings or orders': 'Más reservas o pedidos',
  'Turn first-timers into regulars': 'Que los nuevos se hagan clientes de siempre',
  'Grow catering orders': 'Más pedidos de banquete',
  'Better photos of my food': 'Mejores fotos de mi comida',
  'Reach a younger crowd': 'Llegar a gente más joven',

  /* ── The six budget answers, asked in setup and on Create ─────────────────────────────── */
  'Under $200/mo': 'Menos de $200 al mes',
  '$200 to $500/mo': 'De $200 a $500 al mes',
  '$500 to $1,000/mo': 'De $500 a $1,000 al mes',
  '$1,000 to $2,500/mo': 'De $1,000 a $2,500 al mes',
  'Over $2,500/mo': 'Más de $2,500 al mes',
  'Not sure yet': 'Todavía no sé',

  /* ── Onboarding: the frame every screen sits in ───────────────────────────────────────── */
  'Continue': 'Continuar',
  'Saving...': 'Guardando...',
  'Back': 'Atrás',
  'Finish later': 'Terminar después',
  'Exit': 'Salir',

  /* ── Onboarding: how the business runs ────────────────────────────────────────────────── */
  'How does it run?': '¿Cómo funciona tu negocio?',
  'This decides what we show you and what we never will.': 'Esto decide qué te mostramos y qué nunca te vamos a mostrar.',
  'Pick the closest one': 'Escoge la que más se parezca',
  'A place people come to': 'Un lugar al que llega la gente',
  'One dining room, counter or shop': 'Un comedor, un mostrador o una tienda',
  'A truck or a pop-up': 'Un camión o un puesto',
  'The spot changes': 'El lugar cambia',
  'Delivery only': 'Solo entregas',
  'No dining room. The food goes out.': 'Sin comedor. La comida sale.',
  'Two or more places': 'Dos lugares o más',
  'Each one has its own numbers': 'Cada uno tiene sus propios números',
  'Mostly catering': 'Casi todo banquetes',
  'Offices, parties, big orders': 'Oficinas, fiestas, pedidos grandes',
  'Open for a season': 'Abierto por temporada',
  'Busy part of the year, quiet the rest': 'Una parte del año con mucho trabajo y el resto tranquilo',
}
