import { DomainError } from '#utils/domain_error'

import BookingPaymentRepository from '#features/booking_payments/repositories/booking_payment_repository'
import { elapsedWindow, type MonthWindow } from '#features/bookings/booking_stats'
import BookingRepository from '#features/bookings/repositories/booking_repository'
import { stayTypeOccupancyDays, type StayType } from '#features/bookings/stay_type'
import ClientRepository from '#features/clients/repositories/client_repository'
import ExpenseRepository from '#features/expenses/repositories/expense_repository'
import { aggregateGrossRevenue } from '#features/finance/repositories/finance_repository'
import { belongsToResidence } from '#features/finance/residence_scope'
import { daysWithinWindow } from '#features/finance/revenue_split'
import GetFinanceOverviewUseCase from '#features/finance/use_cases/get_finance_overview.use_case'
import OwnerRepository from '#features/owners/repositories/owner_repository'
import PropertyRepository from '#features/properties/repositories/property_repository'
import ResidenceRepository from '#features/residences/repositories/residence_repository'
import { renderPdf } from '#services/pdf_renderer'
import { uploadReport } from '#services/report_storage'

import { occupancyRatio } from '../metrics/occupancy.ts'
import { buildSettlement } from '../metrics/payments.ts'
import { resolveReportPeriod } from '../report_period.ts'
import { renderFinancialReport, type FinancialReportData } from '../renderers/financial_report.ts'
import {
  renderPerformanceReport,
  type PerformancePropertyRow,
  type PerformanceReportData,
} from '../renderers/performance_report.ts'
import { renderReservationsReport, type ReservationRow } from '../renderers/reservations_report.ts'

import type { BookingDto } from '#features/bookings/dto/booking.dto'
import type { ExpenseDto } from '#features/expenses/dto/expense.dto'
import type { GenerateReportInput, GeneratedReportDto, ReportContext } from '../dto/report.dto.ts'

/**
 * Nombre maximal de biens lus pour composer un rapport.
 *
 * Même plafond que les autres listes paginées de l'API (`per_page` capé à
 * 100) : un parc qui le dépasse n'existe pas aujourd'hui, et le relever se
 * fait sans toucher au use case le jour où ça change.
 */
const MAX_PROPERTIES = 100

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

/** Mois abrégés en français, indexés comme `Date.getUTCMonth()`. */
const MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

const REPORT_TYPE_SLUGS: Record<GenerateReportInput['type'], string> = {
  financial: 'financier',
  performance: 'performance',
  reservations: 'reservations',
}

/**
 * Assainit un fragment destiné à entrer dans un nom de fichier Cloudinary.
 *
 * `uploadReport` concatène le nom reçu tel quel dans le `public_id`, sans le
 * filtrer — c'est donc ici, avant l'appel, que la garantie doit être posée.
 * Minuscules, sans accent, uniquement `[a-z0-9-]` : même normalisation que le
 * commentaire de `document_storage.ts` sur le nom de destination d'un
 * justificatif, pour la même raison — un `../` glissé dans ce nom sortirait
 * du dossier de rapports Cloudinary.
 */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `rapport-<type>-<période>-<horodatage>.pdf`.
 *
 * Chaque composant est maîtrisé par le serveur : `type` est une valeur
 * d'énumération, `periodLabel` dérive de dates déjà validées par
 * `resolveReportPeriod`, `now` est produit par le serveur. Rien qui vienne
 * d'une saisie utilisateur (nom de résidence, de propriétaire) n'entre dans ce
 * nom — l'horodatage garantit en plus qu'une réédition n'écrase pas la
 * précédente.
 */
function buildFilename(type: GenerateReportInput['type'], periodLabel: string, now: Date): string {
  const periodSlug = slugify(periodLabel)
  return `rapport-${REPORT_TYPE_SLUGS[type]}-${periodSlug}-${now.getTime()}.pdf`
}

/** Jours d'une fenêtre, au minimum un jour pour ne jamais diviser par zéro. */
function windowDays(window: { from: Date; to: Date }): number {
  return Math.max(
    1,
    Math.ceil((window.to.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY)
  )
}

/**
 * Jours-bien occupés d'un lot de réservations sur une fenêtre, pondérés par
 * type de séjour — même primitive que `occupancyForWindow` de
 * `booking_stats.ts`, pour que le rapport performance ne recalcule jamais un
 * taux d'occupation par une autre voie que le tableau de bord.
 */
function occupiedDaysInWindow(
  bookings: readonly BookingDto[],
  window: { from: Date; to: Date }
): number {
  return bookings.reduce(
    (sum, booking) =>
      sum +
      stayTypeOccupancyDays(
        (booking.stay_type as StayType) ?? 'full_day',
        daysWithinWindow(booking.start_date, booking.end_date, window.from, window.to)
      ),
    0
  )
}

/** Découpe une fenêtre en mois calendaires, bornés par la fenêtre elle-même. */
function splitIntoMonths(window: { from: Date; to: Date }): MonthWindow[] {
  const months: MonthWindow[] = []
  let cursor = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), 1))

  while (cursor < window.to) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    const from = cursor > window.from ? cursor : window.from
    const to = next < window.to ? next : window.to
    months.push({ from, to })
    cursor = next
  }

  return months
}

export class GenerateReportUseCase {
  constructor(
    private ownerRepo: OwnerRepository = new OwnerRepository(),
    private residenceRepo: ResidenceRepository = new ResidenceRepository(),
    private propertyRepo: PropertyRepository = new PropertyRepository(),
    private bookingRepo: BookingRepository = new BookingRepository(),
    private expenseRepo: ExpenseRepository = new ExpenseRepository(),
    private paymentRepo: BookingPaymentRepository = new BookingPaymentRepository(),
    private clientRepo: ClientRepository = new ClientRepository(),
    private financeOverview: GetFinanceOverviewUseCase = new GetFinanceOverviewUseCase()
  ) {}

  async execute(owner_id: string, input: GenerateReportInput): Promise<GeneratedReportDto> {
    const period = resolveReportPeriod(input)
    const now = new Date()

    const owner = await this.ownerRepo.findById(owner_id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    // Une résidence inconnue — ou appartenant à un autre propriétaire — sortirait
    // un rapport vide indistinguable d'une résidence sans activité : le même
    // contrôle que `GetFinanceOverviewUseCase`, posé ici avant même d'y déléguer,
    // pour couvrir aussi les rapports performance et réservations qui ne
    // passent pas par lui.
    const residence = input.residence_id
      ? await this.residenceRepo.findById(input.residence_id, owner_id)
      : null

    if (input.residence_id && !residence) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    const context: ReportContext = {
      owner_name: owner.full_name,
      residence_name: residence?.name ?? null,
      period,
      generated_at: now,
    }

    try {
      const html = await this.renderHtml(owner_id, input, period.window, context)
      const pdf = await renderPdf(html)
      const filename = buildFilename(input.type, period.label, now)
      const stored = await uploadReport(pdf, filename)

      return {
        url: stored.url,
        expires_at: stored.expires_at,
        filename,
        period: { from: period.from_date, to: period.to_date },
      }
    } catch (error) {
      // Les erreurs métier (période invalide, résidence introuvable) sont déjà
      // levées plus haut en `DomainError` : ce qui atterrit ici vient du rendu
      // PDF ou du téléversement Cloudinary, deux services externes dont
      // l'échec ne doit jamais remonter en `Error` brute jusqu'au client.
      if (error instanceof DomainError) throw error

      throw new DomainError(
        'report_generation_failed',
        'La génération du rapport a échoué. Réessayez.',
        500
      )
    }
  }

  private async renderHtml(
    owner_id: string,
    input: GenerateReportInput,
    window: { from: Date; to: Date },
    context: ReportContext
  ): Promise<string> {
    if (input.type === 'financial') return this.renderFinancial(owner_id, input, window, context)
    if (input.type === 'performance')
      return this.renderPerformance(owner_id, input, window, context)
    return this.renderReservations(owner_id, input, window, context)
  }

  /**
   * Le bilan financier délègue à `GetFinanceOverviewUseCase` plutôt que de
   * recalculer chiffre d'affaires et occupation depuis les réservations : cet
   * écran mobile et ce PDF doivent toujours afficher le même chiffre, et deux
   * chemins de lecture parallèles divergent tôt ou tard.
   */
  private async renderFinancial(
    owner_id: string,
    input: GenerateReportInput,
    window: { from: Date; to: Date },
    context: ReportContext
  ): Promise<string> {
    const [overview, expensesByCategory] = await Promise.all([
      this.financeOverview.execute(owner_id, {
        from: window.from,
        to: window.to,
        residence_id: input.residence_id,
      }),
      this.expensesByCategory(owner_id, input.residence_id, window),
    ])

    const data: FinancialReportData = {
      overview,
      expenses_by_category: expensesByCategory,
    }

    return renderFinancialReport(data, context)
  }

  /**
   * Dépenses par catégorie, dans le même périmètre que `depenses` du bilan.
   *
   * Restreintes à une résidence, les charges retenues par `overview` sont ses
   * charges communes **et** celles de ses unités (deux champs distincts —
   * `residence_id`, `property_id`). Classées ici avec `belongsToResidence`,
   * la même fonction que `FinanceRepository.overview`, sur un seul lot de
   * dépenses déjà chargé — jamais deux requêtes `summary` filtrées
   * séparément puis additionnées : une dépense historique portant à la fois
   * `residence_id` et `property_id` remonterait alors dans les deux et serait
   * comptée deux fois, ce que `belongsToResidence` (qui teste `residence_id`
   * en priorité) exclut par construction.
   */
  private async expensesByCategory(
    owner_id: string,
    residence_id: string | undefined,
    window: { from: Date; to: Date }
  ): Promise<FinancialReportData['expenses_by_category']> {
    const expenses = await this.expenseRepo.findAllForOwner(owner_id, window)

    const scoped = residence_id
      ? await this.filterByResidence(expenses, owner_id, residence_id)
      : expenses

    const merged = new Map<string, number>()
    for (const expense of scoped) {
      merged.set(expense.category, (merged.get(expense.category) ?? 0) + expense.amount)
    }

    return [...merged.entries()].map(([category, amount]) => ({ category, amount }))
  }

  /** Dépenses d'une résidence : ses charges communes et celles de ses unités. */
  private async filterByResidence(
    expenses: ExpenseDto[],
    owner_id: string,
    residence_id: string
  ): Promise<ExpenseDto[]> {
    const units = await this.propertyRepo.paginate({
      owner_id,
      residence_id,
      per_page: MAX_PROPERTIES,
    })
    const unitIds = new Set(units.data.map((unit) => unit.id))

    return expenses.filter((expense) => belongsToResidence(expense, residence_id, unitIds))
  }

  private async renderPerformance(
    owner_id: string,
    input: GenerateReportInput,
    window: { from: Date; to: Date },
    context: ReportContext
  ): Promise<string> {
    const residenceScope = input.residence_id ? { residence_id: input.residence_id } : {}

    const [bookings, properties] = await Promise.all([
      this.bookingRepo.findByPeriod(owner_id, window, residenceScope),
      this.propertyRepo.paginate({
        owner_id,
        residence_id: input.residence_id,
        per_page: MAX_PROPERTIES,
      }),
    ])

    // Même périmètre que `booking_stats.ts` et le relevé financier : un bien
    // réservé passe en « rented » et sort des publiés, mais fait toujours
    // partie du parc exploité.
    const exploitedProperties = properties.data.filter(
      (property) => property.status === 'published' || property.status === 'rented'
    )

    // L'occupation se lit sur les jours **écoulés**, jamais sur la durée
    // calendaire entière : un mois en cours afficherait sinon un taux
    // structurellement bas les premiers jours, et un rapport édité le 2 du
    // mois contredirait celui édité le 30 — même convention que l'onglet
    // Statistiques et `booking_stats.ts`.
    const elapsed = elapsedWindow({ from: window.from, to: window.to }, new Date())

    const availableDays = windowDays(elapsed) * exploitedProperties.length
    // Plafonné à la capacité du parc, comme `FinanceRepository.occupancyRate` :
    // le renderer divise `occupied_days` par `available_days` sans reprendre ce
    // plafond lui-même, et un séjour débordant la fenêtre pousserait sinon le
    // taux affiché au-delà de 100 % — un chiffre que l'écran Finance, qui
    // applique ce même plafond, ne peut jamais produire pour la même période.
    const occupiedDays = Math.min(availableDays, occupiedDaysInWindow(bookings, elapsed))
    const grossRevenue = aggregateGrossRevenue(bookings, elapsed)
    const averageStay = bookings.length
      ? Math.round(bookings.reduce((sum, b) => sum + b.days_count, 0) / bookings.length)
      : 0

    // Le dénominateur est la capacité du **parc**, pas un seul bien : le
    // numérateur (`occupiedDaysInWindow`) cumule les jours occupés sur tous
    // les biens exploités, et le rapporter aux seuls jours calendaires du
    // mois gonflait le ratio d'un facteur égal au nombre de biens — voir
    // `occupancyRatio`. Même capacité que `availableDays` ci-dessus, mois par
    // mois.
    const monthlyOccupancy = splitIntoMonths(elapsed).map((month) => ({
      month: MONTH_LABELS[month.from.getUTCMonth()],
      ratio: occupancyRatio(
        occupiedDaysInWindow(bookings, month),
        windowDays(month) * exploitedProperties.length
      ),
    }))

    const propertyRows: PerformancePropertyRow[] = exploitedProperties.map((property) => {
      const propertyBookings = bookings.filter((b) => b.property_id === property.id)
      const propertyAvailableDays = windowDays(elapsed)

      return {
        property_title: property.title,
        // Même plafond que ci-dessus, appliqué à la capacité d'un seul bien.
        occupied_days: Math.min(
          propertyAvailableDays,
          occupiedDaysInWindow(propertyBookings, elapsed)
        ),
        available_days: propertyAvailableDays,
        gross_revenue: aggregateGrossRevenue(propertyBookings, elapsed),
      }
    })

    const data: PerformanceReportData = {
      occupied_days: occupiedDays,
      available_days: availableDays,
      average_stay: averageStay,
      gross_revenue: grossRevenue,
      monthly_occupancy: monthlyOccupancy,
      properties: propertyRows,
    }

    return renderPerformanceReport(data, context)
  }

  /**
   * L'encaissé se lit exclusivement sur les `booking_payments` `success` :
   * `received_amount` porte, malgré son nom, le montant négocié à la
   * réservation, pas ce qui a été réellement perçu.
   */
  private async renderReservations(
    owner_id: string,
    input: GenerateReportInput,
    window: { from: Date; to: Date },
    context: ReportContext
  ): Promise<string> {
    const residenceScope = input.residence_id ? { residence_id: input.residence_id } : {}
    const bookings = await this.bookingRepo.findByPeriod(owner_id, window, residenceScope)

    if (bookings.length === 0) {
      return renderReservationsReport([], context)
    }

    const [payments, properties, clients] = await Promise.all([
      this.paymentRepo.findSettledByOwner(owner_id, window),
      this.propertiesByIds([...new Set(bookings.map((b) => b.property_id))]),
      this.clientsByIds(owner_id, [...new Set(bookings.map((b) => b.client_id))]),
    ])

    const settlementPayments = payments.map((payment) => ({
      booking_id: payment.booking_id,
      amount: payment.amount,
      status: payment.status,
    }))

    const rows: ReservationRow[] = bookings.map((booking) => {
      const property = properties.get(booking.property_id)
      const client = clients.get(booking.client_id)
      const settlement = buildSettlement(
        { id: booking.id, total_amount: booking.total_amount },
        settlementPayments
      )

      return {
        booking_id: booking.id,
        // Repli sur `start_date`/`end_date` : les réservations antérieures au
        // séjour comptoir ne portent pas `check_in_at`/`check_out_at`.
        check_in_at: booking.check_in_at ?? booking.start_date,
        check_out_at: booking.check_out_at ?? booking.end_date,
        property_title: property?.title ?? '—',
        // Instantané figé à la réservation quand il existe, sinon la fiche
        // carnet courante — les réservations antérieures au comptoir n'ont
        // pas de `client_snapshot`.
        client_name: booking.client?.full_name ?? client?.full_name ?? '—',
        client_phone: booking.client?.phone ?? client?.phone ?? '—',
        has_id_document: client?.documents_status === 'complete',
        days_count: booking.days_count,
        total_amount: booking.total_amount,
        settled_amount: settlement.settled_amount,
        source: booking.source ?? 'online',
      }
    })

    return renderReservationsReport(rows, context)
  }

  /**
   * Titres des biens d'un lot de réservations.
   *
   * Identifiants dédoublonnés avant lecture : plusieurs réservations portent
   * couramment sur le même logement, et Firestore facture chaque lecture —
   * même précaution que `ListOwnerBookingsUseCase.withProperties`.
   */
  private async propertiesByIds(ids: string[]): Promise<Map<string, { title: string }>> {
    const map = new Map<string, { title: string }>()
    if (ids.length === 0) return map

    await Promise.all(
      ids.map(async (id) => {
        const property = await this.propertyRepo.findById(id)
        if (property) map.set(id, { title: property.title })
      })
    )

    return map
  }

  /** Fiches carnet d'un lot de réservations, scopées au propriétaire. */
  private async clientsByIds(
    owner_id: string,
    ids: string[]
  ): Promise<Map<string, { full_name: string; phone: string; documents_status: string }>> {
    const map = new Map<string, { full_name: string; phone: string; documents_status: string }>()
    if (ids.length === 0) return map

    await Promise.all(
      ids.map(async (id) => {
        const client = await this.clientRepo.findById(id, owner_id)
        if (client) {
          map.set(id, {
            full_name: client.full_name,
            phone: client.phone,
            documents_status: client.documents_status,
          })
        }
      })
    )

    return map
  }
}

export default GenerateReportUseCase
