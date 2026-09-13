import { HttpContext } from '@adonisjs/core/http'
import { BaseSerializer } from '@adonisjs/core/transformers'

/**
 * Pagination metadata structure for paginated API responses.
 * Aligned on a Mongoose-friendly shape (no Lucid dependency).
 */
export interface PaginationMetaData {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
  firstPageUrl: string
  lastPageUrl: string
  nextPageUrl: string | null
  previousPageUrl: string | null
}

/**
 * Custom serializer for API responses that ensures consistent JSON structure
 * across all API endpoints. Wraps response data in a 'data' property.
 */
class ApiSerializer extends BaseSerializer<{
  Wrap: 'data'
  PaginationMetaData: PaginationMetaData
}> {
  /**
   * Wraps all serialized data under this key in the response object.
   * Example: { data: [...] } instead of returning raw arrays/objects
   */
  wrap: 'data' = 'data'

  /**
   * Validates and defines pagination metadata structure for paginated responses.
   */
  definePaginationMetaData(metaData: unknown): PaginationMetaData {
    if (
      !metaData ||
      typeof metaData !== 'object' ||
      !('total' in metaData) ||
      !('perPage' in metaData) ||
      !('currentPage' in metaData)
    ) {
      throw new Error('Invalid pagination metadata. Expected total, perPage and currentPage keys')
    }
    return metaData as PaginationMetaData
  }
}

/**
 * Single instance of ApiSerializer used across the application
 */
const serializer = new ApiSerializer()
const serialize = Object.assign(
  function (this: HttpContext, ...[data, resolver]: Parameters<ApiSerializer['serialize']>) {
    return serializer.serialize(data, resolver ?? this.containerResolver)
  },
  {
    withoutWrapping(
      this: HttpContext,
      ...[data, resolver]: Parameters<ApiSerializer['serializeWithoutWrapping']>
    ) {
      return serializer.serializeWithoutWrapping(data, resolver ?? this.containerResolver)
    },
  }
) as ApiSerializer['serialize'] & { withoutWrapping: ApiSerializer['serializeWithoutWrapping'] }

/**
 * Adds the serialize method to all HttpContext instances.
 * Usage in controllers: return ctx.serialize(data)
 * This ensures all API responses follow the same structure with data wrapping.
 */
HttpContext.instanceProperty('serialize', serialize)

/**
 * Module augmentation to add the serialize method to HttpContext.
 * This allows controllers to use ctx.serialize() for consistent API responses.
 */
declare module '@adonisjs/core/http' {
  export interface HttpContext {
    serialize: typeof serialize
  }
}
