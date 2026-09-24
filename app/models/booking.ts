import { createHash } from 'node:crypto'

import type { StayType } from '#features/bookings/stay_type'
import type { ActorScope } from '#features/managers/scope'
import { FIRESTORE_IN_LIMIT, filterByScope, isWithinScope } from '#features/managers/scope'
import {
  collection,
  COLLECTIONS,
  countQuery,
  db,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

const BOOKING_STATUSES = ['confirmed', 'in_progress', 'cancelled', 'completed'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export interface BookingDocument {
  property_id: string
  /**
   * Résidence de l'unité réservée, figée à la création.
   *
   * Copiée depuis l'unité et jamais recalculée : déplacer une unité d'une
   * résidence à une autre réécrirait sinon le chiffre d'affaires déjà
   * constaté des deux, et un mois clos se mettrait à bouger tout seul.
   *
   * Optionnel en lecture : les réservations antérieures n'en portent pas.
   */
  residence_id?: string | null
  owner_id: string
  client_id: string
  status: BookingStatus

  start_date: Date
  end_date: Date
  days_count: number
  /**
   * Ancien nom de `days_count`, encore présent sur les documents antérieurs au
   * passage à une facturation en jours. Jamais écrit, lu en repli.
   */
  nights_count?: number
  /** Tarif journalier et remise de durée figés à la réservation. */
  daily_price: number
  duration_discount_percent: number
  subtotal_amount: number
  discount_amount: number
  total_amount: number
  promo_code: string | null
  message: string | null

  /**
   * Canal de vente. `offline` désigne une réservation prise au comptoir, par
   * opposition à `online` prise par un client via l'application. Ne change
   * jamais — à ne pas confondre avec `sync_status`, qui dit si une saisie sans
   * réseau est parvenue au serveur.
   *
   * Optionnel en lecture : les réservations antérieures n'en portent pas et
   * valent `online`.
   */
  source?: 'online' | 'offline'

  /**
   * Nom et téléphone figés à la réservation.
   *
   * Une fiche client renommée ou archivée ne doit pas réécrire l'historique —
   * même logique que `daily_price`, figé au tarif du jour.
   */
  client_snapshot?: { full_name: string; phone: string } | null

  stay_type?: StayType

  /**
   * Doublent `start_date` / `end_date` avec une précision à l'heure. Les deux
   * couples sont écrits ensemble et tenus identiques : les champs d'origine
   * restent la source pour Finance et les écrans existants.
   */
  check_in_at?: Date
  check_out_at?: Date

  /**
   * Sortie réellement constatée, écrite à la clôture.
   *
   * Distincte de `check_out_at`, qui porte la période *facturée* : le montant a
   * été calculé sur elle, et l'écraser à la clôture réécrirait rétroactivement
   * la répartition d'un revenu déjà constaté sans que `total_amount` bouge —
   * un mois clôturé se mettrait à changer tout seul. Purement informative :
   * ni Finance ni le contrôle de chevauchement ne la lisent.
   */
  actual_check_out_at?: Date

  /**
   * Période et montant vendus, figés par un départ anticipé.
   *
   * Absents tant que le séjour n'a pas été écourté — et sur tout l'historique.
   * Le départ anticipé réécrit `end_date` et `total_amount` ; ces copies
   * gardent la trace de ce qui avait été convenu. Purement informatifs : ni
   * Finance ni le contrôle de chevauchement ne les lisent.
   */
  planned_check_out_at?: Date
  planned_days_count?: number
  planned_total_amount?: number
  /**
   * Somme rendue au client sur un départ anticipé. Absente = rien rendu.
   *
   * Déjà déduite de `total_amount` : Finance ne la retranche pas une seconde
   * fois, elle l'affiche à titre d'information.
   */
  refunded_amount?: number

  /** Montant calculé depuis la grille du bien, avant négociation. */
  expected_amount?: number
  /** Montant réellement convenu, saisi par le propriétaire. */
  received_amount?: number
  deposit_amount?: number

  client_request_id?: string | null
  sync_status?: 'synced' | 'pending' | 'conflict'

  cancelled_at: Date | null
  completed_at: Date | null
  cancellation_reason: string | null

  /**
   * Acteur ayant réellement saisi l'enregistrement — un gérant, ou `null` pour
   * le propriétaire. Optionnel : absent sur les documents antérieurs au rôle
   * gérant. Donnée d'audit, n'entrant dans aucun calcul.
   */
  created_by?: string | null

  created_at: Date
  updated_at: Date
}

export type BookingRecord = WithId<BookingDocument>

function bookings() {
  return collection<BookingDocument>(COLLECTIONS.bookings)
}

export interface BookingFilters {
  client_id?: string
  owner_id?: string
  property_id?: string
  status?: BookingStatus
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
}

function buildQuery(filters: BookingFilters): FirebaseFirestore.Query<BookingDocument> {
  let query = bookings() as FirebaseFirestore.Query<BookingDocument>

  if (filters.client_id) query = query.where('client_id', '==', filters.client_id)
  if (filters.owner_id) query = query.where('owner_id', '==', filters.owner_id)
  if (filters.property_id) query = query.where('property_id', '==', filters.property_id)
  if (filters.status) query = query.where('status', '==', filters.status)

  // Filtrage délégué à Firestore tant que la liste tient dans la limite de
  // l'opérateur `in` ; au-delà, `filterByScope` reprend après lecture.
  const ids = filters.scope_property_ids
  if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
    query = query.where('property_id', 'in', ids)
  }

  return query
}

/**
 * Le périmètre reste-t-il à appliquer après lecture ?
 *
 * Vrai dans les deux cas que `buildQuery` n'a pas pu confier à Firestore : le
 * périmètre vide et celui de plus de 30 logements, où l'opérateur `in` lève.
 * Sans ce second passage, une requête ainsi construite ne porterait aucune
 * restriction et un gérant verrait tout le compte du propriétaire.
 */
export function needsInMemoryScope(filters: BookingFilters): boolean {
  const ids = filters.scope_property_ids
  return Array.isArray(ids) && (ids.length === 0 || ids.length > FIRESTORE_IN_LIMIT)
}

/**
 * La réservation relève-t-elle du périmètre ?
 *
 * `null` ou `undefined` signifie « aucune restriction » — le propriétaire —, et
 * se distingue du tableau vide, qui est un gérant sans affectation et ne doit
 * rien voir. Une réservation sans `property_id` n'est rattachable à aucun
 * logement confié : elle est écartée de tout périmètre restreint.
 */
export function matchesRevenueScope(
  doc: { property_id?: string | null },
  scopePropertyIds?: string[] | null
): boolean {
  if (!Array.isArray(scopePropertyIds)) return true
  return isWithinScope(
    { ownerId: '', actorId: '', propertyIds: scopePropertyIds },
    doc.property_id ?? null
  )
}

/** Champs d'une réservation comptoir, avant composition du document. */
export interface OwnerBookingInput {
  owner_id: string
  property_id: string
  residence_id?: string | null
  client_id: string
  client_snapshot: { full_name: string; phone: string }
  status: BookingStatus
  stay_type: StayType
  check_in_at: Date
  check_out_at: Date
  days_count: number
  daily_price: number
  expected_amount: number
  received_amount: number
  deposit_amount: number
  message: string | null
  client_request_id: string | null
  /** Acteur ayant saisi, `null` pour le propriétaire. Donnée d'audit. */
  created_by?: string | null
}

/**
 * Compose le document d'une réservation comptoir.
 *
 * Extraite de `createOwnerBooking` pour être éprouvée sans Firestore : la
 * composition énumère ses champs un à un, si bien qu'un `created_by` calculé en
 * amont s'y perdrait sans la moindre erreur de compilation. Le seul recours
 * contre cet oubli silencieux est un test, et un test suppose une fonction pure.
 */
export function buildOwnerBookingPayload(input: OwnerBookingInput, now: Date): BookingDocument {
  return {
    property_id: input.property_id,
    residence_id: input.residence_id ?? null,
    owner_id: input.owner_id,
    client_id: input.client_id,
    status: input.status,
    // Les deux couples de dates sont écrits ensemble et tenus identiques :
    // `start_date` reste la source pour Finance et les écrans existants.
    start_date: input.check_in_at,
    end_date: input.check_out_at,
    check_in_at: input.check_in_at,
    check_out_at: input.check_out_at,
    days_count: input.days_count,
    daily_price: input.daily_price,
    duration_discount_percent: 0,
    subtotal_amount: input.expected_amount,
    // L'écart entre attendu et négocié est une remise consentie.
    discount_amount: Math.max(0, input.expected_amount - input.received_amount),
    total_amount: input.received_amount,
    expected_amount: input.expected_amount,
    received_amount: input.received_amount,
    deposit_amount: input.deposit_amount,
    promo_code: null,
    message: input.message,
    source: 'offline',
    stay_type: input.stay_type,
    client_snapshot: input.client_snapshot,
    client_request_id: input.client_request_id,
    sync_status: 'synced',
    cancelled_at: null,
    completed_at: null,
    cancellation_reason: null,
    created_by: input.created_by ?? null,
    created_at: now,
    updated_at: now,
  }
}

/** Périmètre sous la forme attendue par `filterByScope`. */
function scopeOf(filters: BookingFilters): ActorScope {
  // `ownerId` et `actorId` ne servent pas au filtrage par périmètre ; seul
  // `propertyIds` est lu ici.
  return { ownerId: '', actorId: '', propertyIds: filters.scope_property_ids ?? null }
}

const Booking = {
  async findById(id: string): Promise<BookingRecord | null> {
    if (!id) return null
    return toDoc<BookingDocument>(await bookings().doc(id).get())
  },

  /**
   * Crée une réservation en réservant le bien dans le même mouvement.
   *
   * Reprend la transaction Mongo d'origine, avec deux différences imposées par
   * Firestore :
   *
   * 1. **Lectures avant écritures.** Firestore refuse tout `get` après un
   *    `set`/`update` dans une transaction. Le bien et le code promo sont donc
   *    relus d'abord, puis toutes les écritures sont émises.
   * 2. **Pas de filtre conditionnel dans l'update.** Mongo exprimait
   *    « réserve seulement si encore publié » par le filtre de `updateOne` et
   *    lisait `modifiedCount`. Ici la condition est vérifiée explicitement sur
   *    le document relu ; la transaction garantit qu'aucune écriture
   *    concurrente ne s'est glissée entre la lecture et l'écriture.
   *
   * @throws `property_not_available` si le bien n'est plus réservable
   * @throws `promo_usage_limit_reached` si le quota du code promo est atteint
   */
  async createWithPropertyReservation(input: {
    property_id: string
    residence_id?: string | null
    owner_id: string
    client_id: string
    start_date: Date
    end_date: Date
    days_count: number
    daily_price: number
    duration_discount_percent: number
    subtotal_amount: number
    discount_amount: number
    total_amount: number
    promo_code?: string | null
    promo_code_id?: string | null
    message?: string | null
    created_by?: string | null
  }): Promise<BookingRecord> {
    const firestore = db()
    const propertyRef = firestore.collection(COLLECTIONS.properties).doc(input.property_id)
    const bookingRef = bookings().doc()

    const usesPromo = Boolean(input.promo_code_id) && input.discount_amount > 0
    const promoRef = usesPromo
      ? firestore.collection(COLLECTIONS.promoCodes).doc(input.promo_code_id!)
      : null

    const now = new Date()
    const payload: BookingDocument = {
      property_id: input.property_id,
      residence_id: input.residence_id ?? null,
      owner_id: input.owner_id,
      client_id: input.client_id,
      status: 'confirmed',
      start_date: input.start_date,
      end_date: input.end_date,
      days_count: input.days_count,
      daily_price: input.daily_price,
      duration_discount_percent: input.duration_discount_percent,
      subtotal_amount: input.subtotal_amount,
      discount_amount: input.discount_amount,
      total_amount: input.total_amount,
      promo_code: input.promo_code ?? null,
      message: input.message ?? null,
      cancelled_at: null,
      completed_at: null,
      cancellation_reason: null,
      created_by: input.created_by ?? null,
      created_at: now,
      updated_at: now,
    }

    await firestore.runTransaction(async (tx) => {
      // ── Lectures ────────────────────────────────────────────────────────
      const propertySnapshot = await tx.get(propertyRef)
      const property = propertySnapshot.data() as
        | { status?: string; visibility?: { is_public?: boolean } }
        | undefined

      const promoSnapshot = promoRef ? await tx.get(promoRef) : null
      const promo = promoSnapshot?.data() as
        | { uses_count?: number; max_uses?: number | null }
        | undefined

      // ── Vérifications ───────────────────────────────────────────────────
      if (!property || property.status !== 'published' || property.visibility?.is_public !== true) {
        throw new Error('property_not_available')
      }

      if (promoRef) {
        if (!promo) {
          throw new Error('invalid_promo_code')
        }
        const used = promo.uses_count ?? 0
        if (promo.max_uses !== null && promo.max_uses !== undefined && used >= promo.max_uses) {
          throw new Error('promo_usage_limit_reached')
        }
      }

      // ── Écritures ───────────────────────────────────────────────────────
      tx.update(propertyRef, {
        'status': 'reserved',
        'visibility.is_public': false,
        'updated_at': now,
      })

      tx.set(bookingRef, toPayload(payload) as unknown as BookingDocument)

      if (promoRef && promo) {
        tx.update(promoRef, {
          uses_count: (promo.uses_count ?? 0) + 1,
          updated_at: now,
        })

        // L'identifiant reprend la convention de `promo_code_usage` :
        // "<promo_code_id>:<booking_id>", qui porte l'unicité du couple.
        const usageRef = firestore
          .collection(COLLECTIONS.promoCodeUsages)
          .doc(`${input.promo_code_id}:${bookingRef.id}`)

        tx.set(
          usageRef,
          toPayload({
            promo_code_id: input.promo_code_id!,
            user_id: input.client_id,
            booking_id: bookingRef.id,
            discount_applied: input.discount_amount,
            created_at: now,
            updated_at: now,
          })
        )
      }
    })

    return { ...payload, _id: bookingRef.id }
  },

  /**
   * Met à jour une réservation, éventuellement restreinte à un propriétaire ou
   * un client. Le périmètre est vérifié avant écriture : sans lui, n'importe
   * quel utilisateur pourrait modifier la réservation d'un autre.
   */
  async findOneAndUpdate(
    id: string,
    patch: Record<string, unknown>,
    scope: { owner_id?: string; client_id?: string; status?: BookingStatus } = {}
  ): Promise<BookingRecord | null> {
    const current = await Booking.findById(id)
    if (!current) return null

    if (scope.owner_id && current.owner_id !== scope.owner_id) return null
    if (scope.client_id && current.client_id !== scope.client_id) return null
    if (scope.status && current.status !== scope.status) return null

    await bookings()
      .doc(id)
      .update(toPayload({ ...patch, updated_at: new Date() }))

    return Booking.findById(id)
  },

  /**
   * Repousse la sortie d'un séjour, chevauchement vérifié dans le même
   * mouvement.
   *
   * Même raison que `createOwnerBooking` : hors transaction, une prolongation
   * et une réservation concurrente sur le segment gagné se validaient toutes
   * les deux, et deux clients se présentaient pour un seul logement. Le
   * contrôle doit donc lire les réservations actives et écrire dans la même
   * transaction.
   *
   * @throws `booking_period_conflict` si `detectConflict` retourne `true`
   */
  async extendBooking(
    id: string,
    patch: Record<string, unknown>,
    scope: { owner_id?: string; client_id?: string },
    detectConflict: (active: BookingRecord[]) => boolean
  ): Promise<BookingRecord | null> {
    const docRef = bookings().doc(id)

    const updated = await db().runTransaction(async (tx) => {
      // ── Lectures ────────────────────────────────────────────────────────
      const snapshot = await tx.get(docRef)
      if (!snapshot.exists) return null

      const current = toDoc<BookingDocument>(snapshot)
      if (!current) return null
      if (scope.owner_id && current.owner_id !== scope.owner_id) return null
      if (scope.client_id && current.client_id !== scope.client_id) return null

      // Même filtre que `findActiveForProperty` : l'inégalité porte sur
      // `end_date`, porté par toutes les réservations, là où `check_out_at`
      // manque à celles prises en ligne.
      const activeSnapshot = await tx.get(
        bookings()
          .where('property_id', '==', current.property_id)
          .where('end_date', '>', current.end_date)
      )

      // ── Vérifications ───────────────────────────────────────────────────
      if (detectConflict(toDocs<BookingDocument>(activeSnapshot.docs))) {
        throw new Error('booking_period_conflict')
      }

      // ── Écritures ───────────────────────────────────────────────────────
      const now = new Date()
      tx.update(docRef, toPayload({ ...patch, updated_at: now }))

      return { ...current, ...patch, updated_at: now } as BookingRecord
    })

    return updated
  },

  async paginate(
    filters: BookingFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: BookingRecord[]; total: number }> {
    const base = buildQuery(filters)

    // Un périmètre que Firestore n'a pas su appliquer doit l'être ici, avant la
    // découpe en pages : `total` compterait sinon des réservations que
    // l'appelant n'a pas le droit de voir, et la page en montrerait.
    if (needsInMemoryScope(filters)) {
      const snapshot = await base.orderBy('created_at', 'desc').get()
      const matching = filterByScope(toDocs<BookingDocument>(snapshot.docs), scopeOf(filters))

      return {
        data: matching.slice(options.offset, options.offset + options.limit),
        total: matching.length,
      }
    }

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<BookingDocument>(snapshot.docs), total }
  },

  /**
   * Réservations d'un propriétaire chevauchant une période.
   *
   * Sert au calcul financier : chiffre d'affaires, taux d'occupation et durée
   * moyenne de séjour. Les réservations annulées sont écartées — elles n'ont
   * produit aucun revenu.
   *
   * Le chevauchement est évalué en mémoire : Firestore n'accepte qu'un champ en
   * inégalité par requête, et il en faudrait deux (`start_date`, `end_date`).
   *
   * `scope.property_ids` restreint la lecture au périmètre de l'appelant. Absent
   * ou `null`, la lecture reste celle du propriétaire — aucun appelant existant
   * ne change de comportement. C'est la source du chiffre d'affaires et du taux
   * d'occupation : sans ce paramètre, un relevé de gérant porterait les
   * encaissements de logements qui ne lui sont pas confiés.
   */
  async findForRevenue(
    ownerId: string,
    range: { from?: Date; to?: Date } = {},
    scope: { residence_id?: string; property_ids?: string[] | null } = {}
  ): Promise<BookingRecord[]> {
    let query = bookings().where(
      'owner_id',
      '==',
      ownerId
    ) as FirebaseFirestore.Query<BookingDocument>

    // Filtrage délégué à Firestore tant que la liste tient dans la limite de
    // l'opérateur `in` ; au-delà — et sur liste vide, où `in` lève aussi —
    // `matchesRevenueScope` reprend après lecture.
    const ids = scope.property_ids
    if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
      query = query.where('property_id', 'in', ids)
    }

    const snapshot = await query.get()

    return toDocs<BookingDocument>(snapshot.docs).filter((doc) => {
      if (doc.status === 'cancelled') return false

      // Second passage du périmètre : il ne retire rien quand Firestore a déjà
      // filtré, et il est la seule barrière dans les deux cas qu'il ne sait pas
      // exprimer.
      if (!matchesRevenueScope(doc, scope.property_ids)) return false

      // Le rattachement est lu sur la réservation et non sur l’unité : il y a
      // été figé à la création, et une unité déplacée depuis ne doit pas
      // réimputer un chiffre d’affaires déjà constaté.
      if (scope.residence_id && doc.residence_id !== scope.residence_id) return false

      const start = doc.start_date?.getTime() ?? 0
      const end = doc.end_date?.getTime() ?? start

      // Chevauchement, et non inclusion : un séjour à cheval sur la borne
      // compte, sa part de revenu tombant en partie dans la période.
      if (range.to && start > range.to.getTime()) return false
      if (range.from && end < range.from.getTime()) return false

      return true
    })
  },

  /**
   * Réservations non annulées de toute la plateforme, pouvant toucher la
   * période commençant à `from`.
   *
   * Pendant de `findForRevenue` pour le back-office, sans `owner_id`. Seule la
   * borne de sortie est confiée à Firestore — une requête n'admet qu'un champ
   * en inégalité —, sur `end_date` et non `check_out_at`, que les réservations
   * en ligne ne portent pas. La borne d'entrée reste à l'appelant.
   */
  async findEndingAfter(from: Date): Promise<BookingRecord[]> {
    const snapshot = await bookings().where('end_date', '>=', from).get()
    return toDocs<BookingDocument>(snapshot.docs).filter((doc) => doc.status !== 'cancelled')
  },

  /**
   * Clients ayant séjourné dans un logement du périmètre.
   *
   * Sert à cloisonner le carnet : les clients sont rattachés à un `owner_id` et
   * non à un logement, si bien que seule la réservation dit quel gérant a
   * affaire à quel client.
   *
   * Aucun filtre de statut : une réservation annulée a tout de même mis le
   * gérant en relation avec la personne, et écarter sa fiche lui retirerait un
   * contact qu'il connaît. C'est une lecture de visibilité, pas un calcul
   * financier — contrairement à `findForRevenue`, qui écarte les annulations.
   */
  async findClientIdsInScope(
    ownerId: string,
    scopePropertyIds?: string[] | null
  ): Promise<Set<string>> {
    // Sans restriction, le carnet entier est visible : la lecture serait
    // intégralement inutile.
    if (!Array.isArray(scopePropertyIds)) return new Set()
    if (scopePropertyIds.length === 0) return new Set()

    let query = bookings().where(
      'owner_id',
      '==',
      ownerId
    ) as FirebaseFirestore.Query<BookingDocument>

    // Même bascule qu'ailleurs : délégué à Firestore sous la limite de `in`,
    // repris en mémoire au-delà.
    if (scopePropertyIds.length <= FIRESTORE_IN_LIMIT) {
      query = query.where('property_id', 'in', scopePropertyIds)
    }

    const snapshot = await query.get()
    const scope: ActorScope = { ownerId, actorId: ownerId, propertyIds: scopePropertyIds }

    return new Set(
      filterByScope(toDocs<BookingDocument>(snapshot.docs), scope).map((doc) => doc.client_id)
    )
  },

  /**
   * Toutes les réservations d'un client du carnet, la plus récente d'abord.
   *
   * Sert à recalculer les statistiques de la fiche et à afficher son
   * historique. La liste n'est pas paginée : un client du carnet compte ses
   * séjours en dizaines, et un cumul partiel serait faux.
   *
   * Le filtre porte aussi sur `owner_id` : un identifiant de client deviné ne
   * doit pas révéler les séjours enregistrés dans le carnet d'un autre.
   *
   * `scopePropertyIds` restreint la lecture au périmètre de l'appelant. Le
   * filtrage est fait **en mémoire** et non par la requête : celle-ci porte
   * déjà `owner_id`, `client_id` et un tri, et y ajouter un `in` sur
   * `property_id` exigerait un index composite de plus pour un gain nul — la
   * liste est bornée aux séjours d'un seul client. Sans ce filtrage, un gérant
   * lisant une fiche verrait les séjours faits dans les logements qui ne lui
   * sont pas confiés.
   */
  async findByClient(
    ownerId: string,
    clientId: string,
    scopePropertyIds?: string[] | null
  ): Promise<BookingRecord[]> {
    if (!clientId) return []

    const snapshot = await bookings()
      .where('owner_id', '==', ownerId)
      .where('client_id', '==', clientId)
      .orderBy('created_at', 'desc')
      .get()

    const docs = toDocs<BookingDocument>(snapshot.docs)

    return filterByScope(docs, {
      ownerId,
      actorId: ownerId,
      propertyIds: scopePropertyIds ?? null,
    })
  },

  /**
   * Indique si ce client a déjà une réservation active sur ce bien.
   *
   * Mongo l'imposait via un index unique partiel sur `(property_id, client_id)`
   * restreint aux `confirmed`. Firestore n'a pas d'index unique : le contrôle
   * devient applicatif.
   */
  async hasActiveBooking(propertyId: string, clientId: string): Promise<boolean> {
    const snapshot = await bookings()
      .where('property_id', '==', propertyId)
      .where('client_id', '==', clientId)
      .where('status', '==', 'confirmed')
      .limit(1)
      .get()

    return !snapshot.empty
  },

  /**
   * Réservation portant cet identifiant de requête, s'il en existe une.
   *
   * Raccourci de lecture : l'idempotence elle-même est portée par l'écriture
   * atomique de `createOwnerBooking`, un `findByRequestId` suivi d'un `add()`
   * laissant une fenêtre où deux requêtes concurrentes créaient deux
   * réservations.
   *
   * Lecture par identifiant plutôt que par requête : le condensat
   * propriétaire/requête *est* l'identifiant du document depuis que l'écriture
   * est atomique. Un `client_request_id` deviné ne désigne donc rien chez un
   * autre propriétaire.
   *
   * Les réservations comptoir écrites avant ce changement portent un
   * identifiant automatique ; le repli sur la requête indexée continue de les
   * retrouver.
   */
  async findByRequestId(ownerId: string, requestId: string): Promise<BookingRecord | null> {
    if (!requestId) return null

    const derived = await bookings().doc(Booking.ownerRequestDocId(ownerId, requestId)).get()
    if (derived.exists) return toDoc<BookingDocument>(derived)

    const snapshot = await bookings()
      .where('owner_id', '==', ownerId)
      .where('client_request_id', '==', requestId)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return toDoc<BookingDocument>(snapshot.docs[0])
  },

  /**
   * Réservations d'un bien pouvant encore l'immobiliser.
   *
   * Firestore n'accepte qu'un champ en inégalité par requête, or le
   * chevauchement en exige deux (`check_in_at` et `check_out_at`). On filtre
   * donc sur la seule borne de sortie, le chevauchement exact étant évalué en
   * mémoire par `findOverlappingPeriod`. Le volume — les réservations non
   * terminées d'un seul bien — rend le compromis sans incidence.
   *
   * L'inégalité porte sur `end_date` et non `check_out_at` : Firestore exclut
   * d'une requête d'inégalité tout document ne portant pas le champ, or
   * `check_out_at` n'existe que sur les réservations comptoir. Les
   * réservations en ligne, qui n'écrivent que `start_date`/`end_date`,
   * échappaient donc au contrôle de chevauchement — un client payé en ligne et
   * un client du comptoir pouvaient se retrouver le même jour dans le même
   * logement. `end_date` est obligatoire sur toutes les réservations.
   */
  async findActiveForProperty(propertyId: string, from: Date): Promise<BookingRecord[]> {
    const snapshot = await bookings()
      .where('property_id', '==', propertyId)
      .where('end_date', '>', from)
      .get()

    return toDocs<BookingDocument>(snapshot.docs)
  },

  /**
   * Identifiant de document dérivé d'un `client_request_id`.
   *
   * C'est lui qui porte l'idempotence : Firestore garantit l'unicité de
   * l'identifiant, si bien que deux requêtes concurrentes portant le même
   * `client_request_id` visent le même document et qu'une seule peut le créer.
   * Un `findByRequestId` suivi d'un `add()` laissait au contraire une fenêtre
   * de plusieurs allers-retours pendant laquelle les deux lisaient « aucune
   * réservation » et en créaient deux.
   *
   * Le propriétaire entre dans le condensat : sans lui, un `client_request_id`
   * deviné suffirait à désigner — et donc à lire — la réservation d'un autre
   * compte. Le condensat évite par ailleurs les caractères que Firestore
   * refuse dans un identifiant (`/`, `.`, `__…__`), qu'un UUID reçu du client
   * n'est pas tenu de respecter.
   */
  ownerRequestDocId(ownerId: string, requestId: string): string {
    return createHash('sha256').update(`${ownerId}:${requestId}`).digest('hex')
  },

  /**
   * Crée une réservation comptoir, chevauchement vérifié dans le même
   * mouvement.
   *
   * Le bien n'est pas basculé en `reserved` : sa disponibilité se déduit
   * désormais des dates, ce qui laisse vendable un bien réservé pour dans trois
   * mois et le libère seul à la fin du séjour.
   *
   * `total_amount` reçoit le montant négocié : c'est lui qui a été encaissé, et
   * c'est donc lui que le chiffre d'affaires doit refléter.
   *
   * Tout passe par une transaction, pour les deux raisons suivantes :
   *
   * 1. **Chevauchement.** Lu puis écrit hors transaction, le contrôle laissait
   *    passer deux réservations concurrentes sur le même bien et la même nuit —
   *    exactement le double-booking qu'il existe pour empêcher.
   * 2. **Idempotence.** L'écriture vise un identifiant dérivé du
   *    `client_request_id` : un retry après timeout retombe sur le document
   *    déjà écrit au lieu d'en créer un second.
   *
   * Comme dans `createWithPropertyReservation`, toutes les lectures précèdent
   * toutes les écritures : Firestore refuse tout `get` après un `set`.
   *
   * `detectConflict` reçoit les réservations du bien pouvant encore
   * l'immobiliser et dit si l'une d'elles bloque. La règle de chevauchement
   * reste ainsi dans la feature, le modèle n'ayant à connaître que la
   * transaction.
   *
   * @throws `booking_period_conflict` si `detectConflict` retourne `true`
   */
  async createOwnerBooking(
    input: OwnerBookingInput & {
      detectConflict: (active: BookingRecord[]) => boolean
    }
  ): Promise<BookingRecord> {
    const now = new Date()

    const payload = buildOwnerBookingPayload(input, now)

    const docRef = input.client_request_id
      ? bookings().doc(Booking.ownerRequestDocId(input.owner_id, input.client_request_id))
      : bookings().doc()

    // Même filtre que `findActiveForProperty` : `end_date`, présent sur toutes
    // les réservations, là où `check_out_at` manque aux réservations en ligne.
    const activeQuery = bookings()
      .where('property_id', '==', input.property_id)
      .where('end_date', '>', input.check_in_at)

    const existing = await db().runTransaction(async (tx) => {
      // ── Lectures ────────────────────────────────────────────────────────
      // Un retry retombe sur le document déjà écrit : on le retourne tel quel
      // plutôt que d'en refuser la création pour chevauchement avec lui-même.
      const own = input.client_request_id ? await tx.get(docRef) : null
      if (own?.exists) return toDoc<BookingDocument>(own)

      const activeSnapshot = await tx.get(activeQuery)

      // ── Vérifications ───────────────────────────────────────────────────
      if (input.detectConflict(toDocs<BookingDocument>(activeSnapshot.docs))) {
        throw new Error('booking_period_conflict')
      }

      // ── Écritures ───────────────────────────────────────────────────────
      // `create` et non `set` : si une transaction concurrente a écrit le même
      // identifiant depuis la lecture, l'écriture échoue au lieu d'écraser.
      tx.create(docRef, toPayload(payload) as unknown as BookingDocument)
      return null
    })

    return existing ?? { ...payload, _id: docRef.id }
  },
}

export default Booking
export { BOOKING_STATUSES }
