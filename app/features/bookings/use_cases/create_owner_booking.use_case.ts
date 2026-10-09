import { isClientInScope } from '#features/clients/client_scope'
import { assertWithinScope } from '#features/managers/scope'
import Booking from '#models/booking'
import Client from '#models/client'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { ActorScope } from '#features/managers/scope'
import type { PropertyPricing } from '#models/property'

import { findOverlappingPeriod, toPeriods } from '../availability.ts'
import { countStayDays, resolveDiscountPercent } from '../stay_pricing.ts'
import { defaultCheckOutFor, resolveStayTypePrice, type StayType } from '../stay_type.ts'
import BookingRepository from '../repositories/booking_repository.ts'

import type { BookingDto, CreateOwnerBookingInput } from '../dto/booking.dto.ts'

/**
 * Montant attendu d'un séjour comptoir.
 *
 * Distinct de `calculateStayPrice`, qui sert le flux en ligne : celui-ci ne
 * connaît qu'un séjour complet remisé par durée, alors qu'une réservation
 * comptoir peut être infra-journalière et se conclut sur un prix négocié.
 *
 * Le séjour complet porte le palier de durée du bien, comme en ligne : le
 * formulaire comptoir l'annonce au propriétaire, et un serveur qui l'ignorait
 * enregistrait l'écart comme une remise négociée qu'il n'avait pas consentie.
 * Une demi-journée ou un passage se facture à l'unité, sans palier.
 *
 * `minimum_stay_days` n'est pas appliqué hors séjour complet : il vaut 1 par
 * défaut, et l'y soumettre rendrait la demi-journée impossible sur tout bien
 * existant.
 */
export function computeOwnerBookingAmounts(
  pricing: PropertyPricing,
  stayType: StayType,
  checkIn: Date,
  checkOut: Date
): { days: number; expected: number; discountPercent: number } {
  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new DomainError(
      'invalid_stay_dates',
      'La date de sortie doit être postérieure à la date d’entrée.',
      422
    )
  }

  const unitPrice = resolveStayTypePrice(pricing, stayType)

  if (stayType !== 'full_day') {
    // Une demi-journée ou un passage se facture à l'unité ; `days_count` vaut
    // 1 pour rester lisible par Finance et les écrans existants.
    return { days: 1, expected: unitPrice, discountPercent: 0 }
  }

  const days = Math.max(1, countStayDays(checkIn, checkOut))

  const minimum = pricing.minimum_stay_days ?? 1
  if (days < minimum) {
    throw new DomainError('minimum_stay_not_reached', `Séjour minimum de ${minimum} jour(s).`, 422)
  }

  const discountPercent = resolveDiscountPercent(days, pricing.price_tiers)

  // Arrondi au franc, comme `calculateStayPrice` : le FCFA n'a pas de
  // subdivision en circulation.
  return {
    days,
    discountPercent,
    expected: Math.round(days * unitPrice * (1 - discountPercent / 100)),
  }
}

/**
 * Prix convenu d'un séjour comptoir, et le prix unitaire à figer.
 *
 * Un prix unitaire prime sur un total : le total se recalcule alors sur la
 * durée **du serveur**. Le mobile multipliait de son côté, sur un décompte de
 * jours qui pouvait différer d'un jour du nôtre — une sortie une minute après
 * l'heure d'entrée, saisie à la seconde, entame ici un second jour. Le prix
 * stocké divisé par nos jours ne retombait plus sur le prix convenu, et la
 * prolongation facturait 7 500 F un jour négocié à 15 000 F.
 *
 * Un total seul vient d'un appareil antérieur au prix unitaire : il est repris
 * tel quel, sans prix unitaire à figer.
 */
export function resolveAgreedAmount(
  input: { agreed_unit_price?: number | null; received_amount?: number },
  amounts: { days: number; expected: number }
): { received: number; agreedUnitPrice: number | null } {
  const unit = input.agreed_unit_price
  if (typeof unit === 'number' && Number.isFinite(unit)) {
    // Arrondi au franc : le FCFA n'a pas de subdivision en circulation.
    return { received: Math.round(unit * amounts.days), agreedUnitPrice: unit }
  }

  return { received: input.received_amount ?? amounts.expected, agreedUnitPrice: null }
}

/**
 * Enregistre une réservation prise au comptoir.
 *
 * Distinct de `CreateBookingUseCase` : les deux ne partagent ni les règles ni
 * les entrées. Le flux client valide un code promo et refuse qu'un
 * propriétaire réserve son propre bien ; celui-ci gère l'acompte, le montant
 * négocié et l'idempotence.
 */
export class CreateOwnerBookingUseCase {
  async execute(input: CreateOwnerBookingInput): Promise<BookingDto> {
    // Court-circuit d'un retry déjà abouti : évite de relire le bien et le
    // client pour rien. L'idempotence elle-même ne repose pas sur ce contrôle
    // — il n'est pas atomique — mais sur l'écriture par identifiant dérivé de
    // `createOwnerBooking`.
    if (input.client_request_id) {
      const existing = await Booking.findByRequestId(input.owner_id, input.client_request_id)
      if (existing) {
        // Le périmètre est revérifié sur la réservation **retrouvée**, et non
        // sur celle demandée : `buildScopedWrite` a validé le `property_id` de
        // la requête, mais le rejeu rend un autre document. `findByRequestId`
        // n'est cadré que sur `owner_id` — ce qui suffisait quand le
        // propriétaire était seul acteur, et laissait un gérant réutilisant un
        // `client_request_id` déjà employé recevoir le DTO financier d'un
        // logement qui ne lui est pas confié.
        //
        // Le rejeu légitime — même gérant, même logement de son périmètre —
        // passe cette garde inchangé : c'est la garantie sur laquelle repose la
        // file de synchronisation hors ligne.
        if (input.scope) assertWithinScope(input.scope, existing.property_id ?? null)

        return BookingRepository.toDto(existing)
      }
    }

    const property = await Property.findById(input.property_id)
    if (!property || property.owner_id !== input.owner_id) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const client = await Client.findById(input.client_id)
    if (!client || client.owner_id !== input.owner_id) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    // Même famille que le dédoublonnage de `CreateClientUseCase` : le cadrage
    // sur `owner_id` couvre tout le carnet du propriétaire, si bien qu'un
    // identifiant de fiche deviné ferait entrer un client hors périmètre dans
    // le `client_snapshot` — nom et téléphone — que la réservation rend ensuite.
    // La règle de visibilité est celle du carnet, appliquée ici aussi.
    if (input.scope && !(await isClientVisible(client, input.scope))) {
      // 404 et non 403 : la fiche relève bien du propriétaire, et un 403
      // distinguerait un identifiant existant d'un identifiant inventé.
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const checkIn = input.check_in_at
    const checkOut = input.check_out_at ?? defaultCheckOutFor(input.stay_type, checkIn)

    const { days, expected, discountPercent } = computeOwnerBookingAmounts(
      property.pricing,
      input.stay_type,
      checkIn,
      checkOut
    )
    const { received, agreedUnitPrice } = resolveAgreedAmount(input, { days, expected })

    // Le chevauchement est vérifié *dans* la transaction d'écriture : hors
    // transaction, deux saisies concurrentes sur le même bien et la même nuit
    // le passaient toutes les deux, et deux clients se présentaient pour un
    // seul logement.
    let created
    try {
      created = await Booking.createOwnerBooking({
        owner_id: input.owner_id,
        property_id: input.property_id,
        // Figé à la création, comme le flux en ligne.
        residence_id: property.residence_id ?? null,
        client_id: input.client_id,
        client_snapshot: { full_name: client.full_name, phone: client.phone },
        status: input.is_check_in ? 'in_progress' : 'confirmed',
        stay_type: input.stay_type,
        check_in_at: checkIn,
        check_out_at: checkOut,
        days_count: days,
        daily_price: property.pricing.daily_price,
        duration_discount_percent: discountPercent,
        expected_amount: expected,
        received_amount: received,
        agreed_unit_price: agreedUnitPrice,
        deposit_amount: input.deposit_amount ?? 0,
        message: input.message ?? null,
        client_request_id: input.client_request_id ?? null,
        // Traçabilité : le propriétaire reste `owner_id`, l'auteur réel — un
        // gérant — est consigné ici. Énumération champ par champ : l'omettre
        // perdrait l'auteur sans aucune erreur de compilation.
        created_by: input.created_by ?? null,
        referrer: input.referrer ?? null,
        detectConflict: (active) =>
          findOverlappingPeriod(
            { check_in_at: checkIn, check_out_at: checkOut },
            toPeriods(active)
          ) !== null,
      })
    } catch (error) {
      // La transaction ne peut porter qu'une `Error` nue : le code métier lui
      // est rendu ici, la couche modèle n'ayant pas à connaître les statuts
      // HTTP.
      if (error instanceof Error && error.message === 'booking_period_conflict') {
        throw new DomainError(
          'booking_period_conflict',
          'Ce bien est déjà réservé sur cette période.',
          409
        )
      }
      throw error
    }

    return BookingRepository.toDto(created)
  }
}

/**
 * La fiche client relève-t-elle du carnet visible par l'appelant ?
 *
 * Sans périmètre — le propriétaire — le carnet est intact et aucune lecture des
 * séjours n'a lieu : le chemin reste celui d'avant le rôle gérant.
 */
async function isClientVisible(
  client: { _id: string; created_by?: string | null },
  scope: ActorScope
): Promise<boolean> {
  if (scope.propertyIds === null) return true

  const stayed = await Booking.findClientIdsInScope(scope.ownerId, scope.propertyIds)

  return isClientInScope({ _id: client._id, created_by: client.created_by ?? null }, stayed, scope)
}

export default CreateOwnerBookingUseCase
