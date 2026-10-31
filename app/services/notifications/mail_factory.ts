import { ConsoleMailProvider, type MailProvider } from '#services/notifications/mail_provider'
import { ResendMailProvider } from '#services/notifications/resend_mail_provider'
import env from '#start/env'

export const MAIL_PROVIDERS = ['console', 'resend'] as const

export type MailProviderName = (typeof MAIL_PROVIDERS)[number]

export interface MailSettings {
  provider?: string
  from?: string
  replyTo?: string
  resendApiKey?: string
  inProduction: boolean
}

export function mailSettingsFromEnv(inProduction: boolean): MailSettings {
  return {
    provider: env.get('MAIL_PROVIDER'),
    from: env.get('MAIL_FROM'),
    replyTo: env.get('MAIL_REPLY_TO'),
    resendApiKey: env.get('RESEND_API_KEY'),
    inProduction,
  }
}

/**
 * Construit le fournisseur email selon MAIL_PROVIDER. Lève si la valeur est
 * inconnue, si la configuration du fournisseur est incomplète, ou si la
 * production retomberait sur la console — l'appelant décide du repli.
 */
export function buildMailProvider(settings: MailSettings): MailProvider {
  const raw = settings.provider ?? 'console'
  const name = raw as MailProviderName

  if (!MAIL_PROVIDERS.includes(name)) {
    throw new Error(
      `MAIL_PROVIDER="${raw}" inconnu. Valeurs autorisées : ${MAIL_PROVIDERS.join(', ')}`
    )
  }

  switch (name) {
    case 'console':
      if (settings.inProduction) {
        throw new Error(
          'MAIL_PROVIDER vaut « console » (ou est absent) en production : aucun email ne partirait.'
        )
      }
      return new ConsoleMailProvider()

    case 'resend':
      return new ResendMailProvider({
        apiKey: requireSetting(settings.resendApiKey, 'RESEND_API_KEY'),
        from: requireSetting(settings.from, 'MAIL_FROM'),
        replyTo: settings.replyTo,
      })

    default: {
      const exhaustive: never = name
      throw new Error(`Fournisseur email non géré : ${exhaustive as string}`)
    }
  }
}

function requireSetting(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Variable d'environnement requise manquante : ${key}.`)
  }
  return value
}
