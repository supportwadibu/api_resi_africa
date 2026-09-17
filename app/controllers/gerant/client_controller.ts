import {
  createClientValidator,
  listClientsValidator,
  updateClientValidator,
} from '#validators/client/client'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateClientUseCase,
  GetScopedClientUseCase,
  ListClientsUseCase,
  UpdateClientUseCase,
} from '../../features/clients/use_cases/index.ts'

/**
 * Carnet clients vu par un gérant.
 *
 * Les clients sont cloisonnés par `owner_id` et **non par logement** : servir
 * le carnet du propriétaire tel quel donnerait au gérant toute sa clientèle, y
 * compris celle d'autres résidences et d'autres gérants. Le cloisonnement est
 * porté par les use cases, sur deux branches — séjour dans le périmètre, ou
 * fiche créée par le gérant qui interroge.
 */
export default class GerantClientController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listClientsValidator, {
      data: ctx.request.qs(),
    })

    // Le périmètre est passé au use case, qui retient les fiches **avant** de
    // paginer : filtrer après découpe rendrait des pages trouées, et un `total`
    // portant sur le carnet entier apprendrait au gérant combien de clients le
    // propriétaire possède ailleurs.
    const result = await new ListClientsUseCase().execute(
      { ...payload, owner_id: ctx.scope.ownerId },
      ctx.scope
    )

    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createClientValidator)

    const { client, already_existed: alreadyExisted } = await new CreateClientUseCase().execute(
      {
        // Le gérant agit pour le compte du propriétaire : la fiche lui
        // appartient, quel qu'en soit l'auteur.
        owner_id: ctx.scope.ownerId,
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
        // C'est ce champ qui retient la fiche dans le carnet du gérant tant
        // qu'elle n'a aucune réservation : sans lui, elle disparaîtrait entre
        // sa création au comptoir et la réservation qu'elle sert.
        created_by: ctx.scope.actorId,
      },
      { front: payload.id_document_front, back: payload.id_document_back },
      // Le périmètre descend jusqu'au use case : le dédoublonnage par téléphone
      // porte sur tout le carnet du propriétaire, et sans lui la fiche rendue
      // pourrait être celle d'un client hors périmètre.
      ctx.scope
    )

    // `data: null` quand la fiche existe hors périmètre : rien n'a été créé, et
    // le gérant n'apprend rien de la fiche. L'application enchaîne sur la
    // recherche dans son propre carnet plutôt que de préremplir la saisie.
    return alreadyExisted
      ? ctx.response.ok({ data: client, already_existed: true })
      : ctx.response.created({ data: client, already_existed: false })
  }

  async show(ctx: HttpContext) {
    const client = await new GetScopedClientUseCase().execute(ctx.params.id, ctx.scope)
    return ctx.response.ok({ data: client })
  }

  async update(ctx: HttpContext) {
    // La visibilité est vérifiée **avant** l'écriture : l'identifiant vient du
    // client, et sans cette garde un gérant modifierait n'importe quelle fiche
    // du propriétaire en la devinant.
    await new GetScopedClientUseCase().execute(ctx.params.id, ctx.scope)

    const payload = await ctx.request.validateUsing(updateClientValidator)

    const client = await new UpdateClientUseCase().execute(
      ctx.params.id,
      ctx.scope.ownerId,
      {
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
        status: payload.status,
      },
      { front: payload.id_document_front, back: payload.id_document_back }
    )

    return ctx.response.ok({ data: client })
  }
}
