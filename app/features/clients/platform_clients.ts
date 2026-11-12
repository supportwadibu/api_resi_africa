import type { PropertySummaryDto } from '#features/properties/dto/platform_property.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'
import type { BookingStatus } from '#models/booking'

/**
 * Client de la plateforme, tel que le back-office le liste.
 *
 * Deux natures, deux collections : une **fiche du carnet** d'un propriétaire
 * (saisie au comptoir, rattachée à ce seul propriétaire) et un **compte
 * client** de l'application (rattaché à personne). Ni l'une ni l'autre ne
 * désigne de logement : seules les réservations disent qui a séjourné où —
 * et, pour un compte, chez quels propriétaires.
 */
export interface PlatformClientDto {
  id: string
  kind: 'carnet' | 'account'
  full_name: string
  phone: string | null
  email: string | null
  /** Fiche : son propriétaire. Compte : les propriétaires des logements réservés. */
  owners: UserSummaryDto[]
  /** Logements réservés, du plus récent au plus ancien séjour. */
  properties: PlatformClientPropertyDto[]
  /** Réservations hors annulations — même règle que les statistiques du carnet. */
  stays: number
  total_paid: number
  last_stay_at: Date | null
  created_at: Date | null
}

export interface PlatformClientPropertyDto {
  property: PropertySummaryDto
  owner_id: string
  stays: number
  last_stay_at: Date
}

export interface CarnetSource {
  _id: string
  owner_id: string
  full_name?: string
  phone?: string
  created_at?: Date
}

export interface AccountSource {
  _id: string
  full_name?: string
  phone?: string | null
  email?: string | null
  metadata?: { created_at?: Date }
}

export interface BookingSource {
  property_id: string
  owner_id: string
  client_id: string
  /** Absent des réservations antérieures au comptoir : en ligne. */
  source?: 'online' | 'offline'
  status: BookingStatus
  start_date: Date
  total_amount?: number
}

export interface PlatformClientsFilters {
  q?: string
  kind?: 'carnet' | 'account'
  owner_id?: string
  property_id?: string
}

/** Clé d'un client : un compte et une fiche peuvent porter le même identifiant. */
function keyOf(kind: PlatformClientDto['kind'], id: string): string {
  return `${kind}:${id}`
}

/**
 * Assemble les clients à partir des fiches, des comptes et des réservations.
 *
 * Un compte sans réservation figure dans la liste — il est inscrit — mais sans
 * propriétaire ni logement. Une réservation dont la fiche ou le compte a
 * disparu (purge) est ignorée : son instantané vit dans la liste des
 * réservations, pas ici.
 */
export function buildPlatformClients(input: {
  carnet: CarnetSource[]
  accounts: AccountSource[]
  bookings: BookingSource[]
  owners: Map<string, UserSummaryDto>
  properties: Map<string, PropertySummaryDto>
}): PlatformClientDto[] {
  const clients = new Map<string, PlatformClientDto>()

  for (const fiche of input.carnet) {
    const owner = input.owners.get(fiche.owner_id)
    clients.set(keyOf('carnet', fiche._id), {
      id: fiche._id,
      kind: 'carnet',
      full_name: fiche.full_name ?? '',
      phone: fiche.phone ?? null,
      email: null,
      owners: owner ? [owner] : [],
      properties: [],
      stays: 0,
      total_paid: 0,
      last_stay_at: null,
      created_at: fiche.created_at ?? null,
    })
  }

  for (const account of input.accounts) {
    clients.set(keyOf('account', account._id), {
      id: account._id,
      kind: 'account',
      full_name: account.full_name ?? '',
      phone: account.phone ?? null,
      email: account.email ?? null,
      owners: [],
      properties: [],
      stays: 0,
      total_paid: 0,
      last_stay_at: null,
      created_at: account.metadata?.created_at ?? null,
    })
  }

  // Ordre chronologique inverse : la première réservation vue d'un logement
  // donne sa date de dernier séjour, et les logements sortent déjà triés.
  const bookings = [...input.bookings].sort(
    (a, b) => b.start_date.getTime() - a.start_date.getTime()
  )

  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue
    const kind = booking.source === 'offline' ? 'carnet' : 'account'
    const client = clients.get(keyOf(kind, booking.client_id))
    if (!client) continue

    client.stays += 1
    client.total_paid += booking.total_amount ?? 0
    client.last_stay_at ??= booking.start_date

    const entry = client.properties.find((p) => p.property.id === booking.property_id)
    if (entry) {
      entry.stays += 1
    } else {
      const property = input.properties.get(booking.property_id)
      if (property) {
        client.properties.push({
          property,
          owner_id: booking.owner_id,
          stays: 1,
          last_stay_at: booking.start_date,
        })
      }
    }

    if (kind === 'account' && !client.owners.some((o) => o.id === booking.owner_id)) {
      const owner = input.owners.get(booking.owner_id)
      if (owner) client.owners.push(owner)
    }
  }

  return [...clients.values()]
}

/** Minuscules et sans accents, espaces retirés pour les numéros. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Filtre et trie : le dernier séjour d'abord, les clients sans séjour ensuite, par nom. */
export function filterPlatformClients(
  clients: PlatformClientDto[],
  filters: PlatformClientsFilters
): PlatformClientDto[] {
  const needle = normalize(filters.q ?? '')
  const compact = needle.replace(/\s/g, '')

  return clients
    .filter((client) => {
      if (filters.kind && client.kind !== filters.kind) return false
      if (filters.owner_id && !client.owners.some((o) => o.id === filters.owner_id)) return false
      if (
        filters.property_id &&
        !client.properties.some((p) => p.property.id === filters.property_id)
      ) {
        return false
      }
      if (!needle) return true
      const text = normalize(
        [
          client.full_name,
          client.email,
          ...client.owners.map((o) => o.full_name),
          ...client.properties.map((p) => `${p.property.title} ${p.property.unit_label ?? ''}`),
        ]
          .filter(Boolean)
          .join(' ')
      )
      return (
        text.includes(needle) ||
        (compact.length > 0 && (client.phone ?? '').replace(/\s/g, '').includes(compact))
      )
    })
    .sort((a, b) => {
      const byStay = (b.last_stay_at?.getTime() ?? -1) - (a.last_stay_at?.getTime() ?? -1)
      return byStay !== 0 ? byStay : a.full_name.localeCompare(b.full_name, 'fr')
    })
}
