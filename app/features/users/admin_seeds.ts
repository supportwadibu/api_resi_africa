import { createAdminValidator } from '#validators/user/user'
import { errors as vineErrors } from '@vinejs/vine'

/** Administrateur à garantir, entrée déjà validée et normalisée. */
export interface AdminSeed {
  full_name: string
  email: string
  phone?: string
  password: string
}

export interface ParsedAdminSeeds {
  admins: AdminSeed[]
  /** Messages lisibles, sans jamais reprendre la valeur fournie. */
  errors: string[]
}

/**
 * Lit la variable `BOOTSTRAP_ADMINS` : un tableau JSON de
 * `{ full_name, email, phone?, password }`.
 *
 * Les messages d'erreur ne citent jamais le contenu brut : la variable porte
 * des mots de passe en clair, et les journaux de Render sont lisibles par
 * toute l'équipe. Une entrée invalide est écartée sans bloquer les autres.
 */
export async function parseAdminSeeds(raw: string | undefined): Promise<ParsedAdminSeeds> {
  if (!raw || raw.trim() === '') return { admins: [], errors: [] }

  let entries: unknown
  try {
    entries = JSON.parse(raw)
  } catch {
    return { admins: [], errors: ['BOOTSTRAP_ADMINS n’est pas un JSON valide.'] }
  }
  if (!Array.isArray(entries)) {
    return { admins: [], errors: ['BOOTSTRAP_ADMINS doit être un tableau JSON.'] }
  }

  const admins: AdminSeed[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (const [index, entry] of entries.entries()) {
    const label = `BOOTSTRAP_ADMINS[${index}]`
    try {
      const admin = await createAdminValidator.validate(entry)
      if (seen.has(admin.email)) {
        errors.push(`${label} : e-mail ${admin.email} en double, entrée ignorée.`)
        continue
      }
      seen.add(admin.email)
      admins.push(admin)
    } catch (error) {
      if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
      for (const issue of error.messages as { field: string; message: string }[]) {
        errors.push(`${label}.${issue.field} : ${issue.message}`)
      }
    }
  }

  return { admins, errors }
}
