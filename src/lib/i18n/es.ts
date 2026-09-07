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
  'Actions': 'Dieron el paso',
  'Orders': 'Te pidieron',
  'Retention': 'Volvieron',
  'times you showed up on Google': 'veces que apareciste en Google',
  'times you showed up on Google and social': 'veces que apareciste en Google y en redes',
  'website visits & clicks': 'visitas y clics a tu página',
  'directions & calls': 'cómo llegar y llamadas',
  'walk-in orders from Google': 'pedidos en el local que llegaron por Google',
  'came back for more': 'volvieron por más',

  /* ── Home: the same five stages, in the words of a truck, a kitchen, a caterer ─────────── */
  'directions & calls to the truck': 'cómo llegar al camión y llamadas',
  'orders at the truck from Google': 'pedidos en el camión que llegaron por Google',
  'Orders you took at the truck, counted from the people Google sent you.': 'Pedidos que tomaste en el camión, contados de la gente que te mandó Google.',
  'found you again': 'te volvieron a encontrar',
  'calls & clicks': 'llamadas y clics',
  'delivery orders from Google': 'pedidos a domicilio que llegaron por Google',
  'Delivery orders that started on Google, from your own site or your delivery apps.': 'Pedidos a domicilio que empezaron en Google, desde tu página o desde tus apps de entrega.',
  'ordered again': 'volvieron a pedir',
  'walk-in orders from Google, this shop': 'pedidos en el local que llegaron por Google, esta sucursal',
  'catering orders that started on Google': 'pedidos para eventos que empezaron en Google',
  'Catering jobs that started with someone finding you on Google.': 'Pedidos para eventos que empezaron porque alguien te encontró en Google.',
  'booked you again': 'te volvieron a contratar',
  'walk-in orders from Google this season': 'pedidos en el local que llegaron por Google esta temporada',

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
  'Custom': 'Otras fechas',
  '7 days': '7 días',
  '30 days': '30 días',
  '90 days': '90 días',
  '1 year': '1 año',

  /* ── Home: what we counted, and who is on your work ───────────────────────────────────── */
  'Counted, as promised': 'Contado, como prometimos',
  'Before and after on your whole listing. It shows what happened, not proof of cause.': 'Antes y después en todo tu perfil. Muestra lo que pasó. No prueba que fue por esto.',
  'The people on your work': 'Las personas en tus pedidos',
  'Get help': 'Pedir ayuda',
  'A real person replies within one business day.': 'Una persona de verdad te contesta en un día hábil.',
  '{n} pieces of work': '{n} trabajos',

  /* ── The reply promise, and the clock on it ───────────────────────────────────────────── */
  'within one business day': 'en un día hábil',
  'Sent': 'Enviado',
  'we answer': 'contestamos',
  'due': 'vence el',
  'Answered in': 'Contestado en',

  /* ── Messages: the strip, the inbox and one conversation ──────────────────────────────── */
  'Messages': 'Mensajes',
  'People': 'Personas',
  'Message': 'Escribir',
  'Message {name}': 'Escríbele a {name}',
  'Message {name}…': 'Escríbele a {name}…',
  'Say what you need. A real person picks it up.': 'Di lo que necesitas. Una persona de verdad lo lee.',
  'Search people and messages…': 'Busca personas y mensajes…',
  'No messages yet': 'Todavía no hay mensajes',
  'Tap someone above to say hello. A real person on your team answers.': 'Toca a alguien de arriba para saludar. Te contesta una persona de tu equipo.',
  'No matches': 'Sin resultados',
  'No people or messages match that search.': 'Ninguna persona ni mensaje coincide con esa búsqueda.',
  'No business linked yet': 'Todavía no hay un negocio ligado',
  'Finish setting up your restaurant to start messaging your team.': 'Termina de preparar tu restaurante para escribirle a tu equipo.',
  'Loading…': 'Cargando…',
  'Send': 'Enviar',
  'Sending…': 'Enviando...',
  'Sent · {time}': 'Enviado · {time}',
  'Today': 'Hoy',
  'Yesterday': 'Ayer',
  'now': 'ahora',
  /* who you can reach, and what each one is for */
  'Your strategist': 'Tu estratega',
  'Videographer': 'Camarógrafo',
  'Photographer': 'Fotógrafo',
  'Designer': 'Diseñador',
  'Account & billing': 'Cuenta y pagos',
  'Support': 'Ayuda',
  'Plans, priorities, anything': 'Planes, prioridades, lo que sea',
  'Films your content': 'Graba tus videos',
  'Photos of your food & space': 'Fotos de tu comida y tu local',
  'Graphics, menus, flyers': 'Gráficos, menús, volantes',
  'Plans, invoices, payments': 'Planes, facturas, pagos',
  'Anything else': 'Cualquier otra cosa',

  /* ── Get help ─────────────────────────────────────────────────────────────────────────── */
  'A real person answers': 'Te contesta una persona de verdad',
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
  'For delivery only': 'Para entregas',
  'For this shop': 'Para esta sucursal',
  'For catering': 'Para eventos',
  'For the season': 'Para la temporada',
  'From your own numbers': 'De tus propios números',
  'No numbers yet': 'Todavía sin números',
  '{n} you can order today': '{n} que puedes pedir hoy',
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
  'Improve online reputation': 'Que hablen bien de mí en internet',
  'Launch something new': 'Lanzar algo nuevo',
  'Stay top of mind': 'Que no se olviden de mí',
  'Compete with nearby businesses': 'Competir con los negocios de aquí cerca',
  'More bookings or orders': 'Más reservas o pedidos',
  'Turn first-timers into regulars': 'Que los nuevos se hagan clientes de siempre',
  'Grow catering orders': 'Más pedidos para eventos',
  'Better photos of my food': 'Mejores fotos de mi comida',
  'Reach a younger crowd': 'Llegar a gente más joven',

  /* ── The six budget answers, asked in setup and on Create ─────────────────────────────── */
  'Under $200/mo': 'Menos de $200 al mes',
  '$200 to $500/mo': 'De $200 a $500 al mes',
  '$500 to $1,000/mo': 'De $500 a $1,000 al mes',
  '$1,000 to $2,500/mo': 'De $1,000 a $2,500 al mes',
  'Over $2,500/mo': 'Más de $2,500 al mes',
  'Not sure yet': 'Todavía no sé',

  /* ── Onboarding: what matters most (the fourteen tiles' second lines) ─────────────────── */
  'What matters most right now?': '¿Qué es lo más importante ahorita?',
  'Pick up to three.': 'Escoge hasta tres.',
  'Fill the quiet nights': 'Llenar las noches tranquilas',
  'More people through the door': 'Más gente entrando por la puerta',
  'Be known nearby': 'Que te conozcan aquí cerca',
  'A dish, a service, a night': 'Un platillo, un servicio, una noche',
  'More people following along': 'Más gente siguiéndote',
  'A higher rating, answered reviews': 'Mejor calificación y reseñas contestadas',
  'A menu, a look, an opening': 'Un menú, una imagen, una apertura',
  'Be remembered between visits': 'Que se acuerden de ti entre visitas',
  'Win the block': 'Ganar la cuadra',
  'Online, direct where you can': 'En internet, directo contigo cuando se pueda',
  'One visit into ten': 'Que una visita se haga diez',
  'Group and office orders': 'Pedidos de grupos y oficinas',
  'Plates that sell themselves': 'Platillos que se venden solos',
  'Where they actually look': 'Donde de verdad buscan',

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
  'Mostly catering': 'Casi todo eventos',
  'Offices, parties, big orders': 'Oficinas, fiestas, pedidos grandes',
  'Open for a season': 'Abierto por temporada',
  'Busy part of the year, quiet the rest': 'Una temporada fuerte, el resto tranquilo',
}
