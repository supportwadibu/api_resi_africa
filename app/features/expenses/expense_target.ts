import { DomainError } from '#utils/domain_error'

/**
 * Rattachement d'une dépense : un bien, ou une résidence.
 *
 * Le mot « cible » plutôt que « bien » parce qu'une charge commune —
 * électricité, gardien — ne concerne aucun logement en particulier et se
 * rattache au lieu.
 */
export type ExpenseTarget =
  | { kind: 'property'; property_id: string; residence_id: null }
  | { kind: 'residence'; property_id: null; residence_id: string }

/**
 * Valide le rattachement d'une dépense et en donne la forme canonique.
 *
 * **Exactement un** des deux identifiants est exigé :
 *
 * - aucun, et la dépense ne serait imputable nulle part — elle disparaîtrait de
 *   tout relevé tout en pesant sur le bénéfice global ;
 * - les deux, et un relevé de résidence la compterait deux fois, une fois par
 *   son unité et une fois par le lieu.
 *
 * Les chaînes vides sont traitées comme absentes : un formulaire qui n'a rien
 * sélectionné envoie couramment `''` plutôt que d'omettre la clé.
 */
export function resolveExpenseTarget(input: {
  property_id?: string | null
  residence_id?: string | null
}): ExpenseTarget {
  const propertyId = input.property_id?.trim() || null
  const residenceId = input.residence_id?.trim() || null

  if (propertyId && residenceId) {
    throw new DomainError(
      'ambiguous_expense_target',
      'Une dépense se rattache soit à un logement, soit à la résidence, pas aux deux.',
      422
    )
  }

  if (propertyId) {
    return { kind: 'property', property_id: propertyId, residence_id: null }
  }

  if (residenceId) {
    return { kind: 'residence', property_id: null, residence_id: residenceId }
  }

  throw new DomainError(
    'expense_target_required',
    'Indiquez le logement ou la résidence concernée par cette dépense.',
    422
  )
}
