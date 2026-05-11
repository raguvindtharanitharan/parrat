/**
 * Default tenant identifier used in OSS / single-tenant deployments.
 * In v1 every entity carries this value; multi-tenant runtime (Enterprise,
 * Phase 3+) replaces it without changing the data shape.
 */
export const DEFAULT_TENANT_ID = 'default' as const;

export type TenantId = string;

/**
 * Base shape carried by every Parrat domain object.
 */
export interface ParratEntity {
  tenantId: TenantId;
}
