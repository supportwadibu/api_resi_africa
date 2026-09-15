import { DateTime } from 'luxon'
import { DomainError } from '#utils/domain_error'

/**
 * Fuseau de référence du produit. La Côte d'Ivoire est à UTC+0 et ne pratique
 * pas l'heure d'été : les bornes d'un mois y coïncident avec celles d'UTC.
 * Le fuseau reste nommé explicitement pour que l'intention survive à un
 * déploiement sur un serveur réglé ailleurs.
 */
const REPORT_TIMEZONE = 'Africa/Abidjan'

/**
 * Plafond de la plage demandée.
 *
 * Un relevé de réservations sur cinq ans produirait un document de plusieurs
 * centaines de pages et ferait expirer le timeout de rendu. Le refus explicite
 * vaut mieux qu'une requête qui s'interrompt sans message exploitable.
 */
const MAX_PERIOD_MONTHS = 24

export type ReportPeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'custom'

/** Fenêtre bornée à gauche, ouverte à droite — `from` inclus, `to` exclu. */
export interface ReportWindow {
  from: Date
  to: Date
}

export interface ResolvedPeriod {
  window: ReportWindow
  /** Libellé affichable : « Mars 2026 », « Année 2026 », « 01/03 – 15/04/2026 ». */
  label: string
  /** Borne de début, inclusive, en `YYYY-MM-DD`. */
  from_date: string
  /** Borne de fin, **inclusive**, en `YYYY-MM-DD`. */
  to_date: string
}

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

function parseDay(value: string): DateTime {
  const parsed = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: REPORT_TIMEZONE })

  if (!parsed.isValid) {
    throw new DomainError(
      'invalid_report_period',
      'Les dates doivent être au format AAAA-MM-JJ.',
      422
    )
  }

  return parsed.startOf('day')
}

/**
 * Convertit une fenêtre Luxon en bornes exposables.
 *
 * `to` arrive **exclu** — convention interne partagée avec `MonthWindow` de
 * `booking_stats.ts` — et ressort **inclus** dans `to_date`, parce qu'un
 * utilisateur lit « du 1er au 31 mars », jamais « jusqu'au 1er avril exclu ».
 * C'est le seul endroit du code où les deux conventions se rencontrent.
 */
function toResolved(from: DateTime, toExclusive: DateTime, label: string): ResolvedPeriod {
  return {
    window: { from: from.toJSDate(), to: toExclusive.toJSDate() },
    label,
    from_date: from.toFormat('yyyy-MM-dd'),
    to_date: toExclusive.minus({ days: 1 }).toFormat('yyyy-MM-dd'),
  }
}

export function resolveReportPeriod(
  input: { period: ReportPeriodPreset; from?: string; to?: string },
  now: Date = new Date()
): ResolvedPeriod {
  const reference = DateTime.fromJSDate(now, { zone: REPORT_TIMEZONE })

  if (input.period === 'this_month') {
    const start = reference.startOf('month')
    return toResolved(
      start,
      start.plus({ months: 1 }),
      `${MONTH_NAMES[start.month - 1]} ${start.year}`
    )
  }

  if (input.period === 'last_month') {
    const start = reference.startOf('month').minus({ months: 1 })
    return toResolved(
      start,
      start.plus({ months: 1 }),
      `${MONTH_NAMES[start.month - 1]} ${start.year}`
    )
  }

  if (input.period === 'this_year') {
    const start = reference.startOf('year')
    return toResolved(start, start.plus({ years: 1 }), `Année ${start.year}`)
  }

  if (!input.from || !input.to) {
    throw new DomainError(
      'invalid_report_period',
      'Indiquez les dates de début et de fin de la période.',
      422
    )
  }

  const from = parseDay(input.from)
  const toInclusive = parseDay(input.to)

  if (toInclusive < from) {
    throw new DomainError(
      'invalid_report_period',
      'La date de fin doit suivre la date de début.',
      422
    )
  }

  // Le jour de fin est inclus : la fenêtre s'arrête au début du lendemain,
  // sinon un séjour du dernier jour sortirait du relevé.
  const toExclusive = toInclusive.plus({ days: 1 })

  if (toExclusive.diff(from, 'months').months > MAX_PERIOD_MONTHS) {
    throw new DomainError(
      'report_period_too_large',
      'La période ne peut pas dépasser 24 mois.',
      422
    )
  }

  return toResolved(
    from,
    toExclusive,
    `${from.toFormat('dd/MM/yyyy')} – ${toInclusive.toFormat('dd/MM/yyyy')}`
  )
}
